// DM sync job: fetch X DMs for all connected OAuth accounts, upsert conversations/events,
// emit events for TG handle detection and replies from leads.
// Ported from /src/worker/api/dm.ts in the CF worker.

import { eq } from "drizzle-orm";
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { getDb } from "../db/index.js";
import { dmConversations, dmEvents, leads } from "../db/schema.js";
import { STATE_KEYS, EVENT_NAMES } from "../constants.js";

const TG_HANDLE_REGEX = /@([a-zA-Z0-9_]{5,32})|t\.me\/([a-zA-Z0-9_]+)/g;

function detectTgHandles(text: string): string[] {
  const handles = new Set<string>();
  for (const match of text.matchAll(TG_HANDLE_REGEX)) {
    handles.add(match[1] ?? match[2]);
  }
  return [...handles];
}

interface OAuthToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  userId?: string;
}

export async function handleDmSync(ctx: PluginContext): Promise<void> {
  // Get list of connected OAuth accounts from state registry
  const accountsRaw = await ctx.state.get(STATE_KEYS.oauthAccounts);
  if (!accountsRaw) {
    ctx.logger.info("[dm-sync] No connected OAuth accounts, skipping");
    return;
  }

  let usernames: string[];
  try {
    usernames = JSON.parse(accountsRaw as string) as string[];
  } catch {
    ctx.logger.error("[dm-sync] Failed to parse oauth_connected_accounts");
    return;
  }

  if (!usernames.length) {
    ctx.logger.info("[dm-sync] No connected accounts in registry");
    return;
  }

  ctx.logger.info(`[dm-sync] Syncing DMs for ${usernames.length} account(s): ${usernames.join(", ")}`);

  for (const username of usernames) {
    try {
      await syncDmsForAccount(ctx, username);
    } catch (err) {
      ctx.logger.error(`[dm-sync] Failed for @${username}: ${err}`);
    }
  }
}

async function syncDmsForAccount(ctx: PluginContext, username: string): Promise<void> {
  // Get OAuth token for this account
  const tokenRaw = await ctx.state.get(STATE_KEYS.oauthToken(username));
  if (!tokenRaw) {
    ctx.logger.warn(`[dm-sync] No OAuth token for @${username}, skipping`);
    return;
  }

  let token: OAuthToken;
  try {
    token = JSON.parse(tokenRaw as string) as OAuthToken;
  } catch {
    ctx.logger.error(`[dm-sync] Failed to parse token for @${username}`);
    return;
  }

  // Check token expiry
  if (token.expiresAt && token.expiresAt < Math.floor(Date.now() / 1000)) {
    ctx.logger.warn(`[dm-sync] Token expired for @${username}`);
    try {
      await ctx.events.emit(EVENT_NAMES.tokenExpiry, "", {
        username,
        expiresAt: token.expiresAt,
      });
    } catch { /* non-critical */ }
    return;
  }

  // Fetch DM events from X API
  const dmRes = await fetch(
    "https://api.x.com/2/dm_events?max_results=100&dm_event.fields=dm_conversation_id,created_at,sender_id,text,event_type&expansions=sender_id&user.fields=username",
    { headers: { Authorization: `Bearer ${token.accessToken}` } }
  );

  if (!dmRes.ok) {
    const err = await dmRes.text();
    ctx.logger.error(`[dm-sync] X API error for @${username}: ${dmRes.status} ${err}`);
    return;
  }

  const dmData = await dmRes.json() as {
    data?: Array<{
      id: string;
      text?: string;
      dm_conversation_id: string;
      sender_id: string;
      event_type: string;
      created_at: string;
    }>;
    includes?: {
      users?: Array<{ id: string; username: string }>;
    };
  };

  if (!dmData.data?.length) {
    ctx.logger.info(`[dm-sync] No DM events for @${username}`);
    return;
  }

  // Build user ID → username map
  const userMap = new Map<string, string>();
  for (const u of dmData.includes?.users ?? []) {
    userMap.set(u.id, u.username);
  }

  const now = Math.floor(Date.now() / 1000);
  const db = getDb();

  // Group events by conversation
  const convMap = new Map<
    string,
    {
      events: typeof dmData.data;
      participants: Set<string>;
      allTgHandles: Set<string>;
    }
  >();

  for (const ev of dmData.data) {
    let conv = convMap.get(ev.dm_conversation_id);
    if (!conv) {
      conv = { events: [], participants: new Set(), allTgHandles: new Set() };
      convMap.set(ev.dm_conversation_id, conv);
    }
    conv.events.push(ev);
    const senderUsername = userMap.get(ev.sender_id);
    if (senderUsername) conv.participants.add(senderUsername);
    if (ev.text) {
      for (const h of detectTgHandles(ev.text)) {
        conv.allTgHandles.add(h);
      }
    }
  }

  // Load known lead handles for reply detection
  const knownLeads = db.select({ handle: leads.handle, id: leads.id }).from(leads).all();
  const leadHandleSet = new Map<string, string>(
    knownLeads.map((l) => [l.handle.toLowerCase(), l.id])
  );

  let syncedEvents = 0;

  for (const [convId, conv] of convMap) {
    // Sort events by created_at desc to get latest
    const sorted = conv.events!.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    const latest = sorted[0];

    // Check if conversation exists
    const existing = db
      .select()
      .from(dmConversations)
      .where(eq(dmConversations.id, convId))
      .get();

    const participantUsernames = JSON.stringify([...conv.participants]);
    const detectedTgHandles = conv.allTgHandles.size > 0 ? JSON.stringify([...conv.allTgHandles]) : null;
    const preview = latest.text?.slice(0, 200) ?? null;

    if (existing) {
      // Merge TG handles
      const existingHandles: string[] = existing.detectedTgHandles
        ? JSON.parse(existing.detectedTgHandles)
        : [];
      const mergedHandles = [...new Set([...existingHandles, ...conv.allTgHandles])];

      db.update(dmConversations)
        .set({
          participantUsernames,
          lastDmAt: latest.created_at,
          lastDmPreview: preview,
          detectedTgHandles: mergedHandles.length > 0 ? JSON.stringify(mergedHandles) : null,
          syncedAt: now,
        })
        .where(eq(dmConversations.id, convId))
        .run();
    } else {
      db.insert(dmConversations).values({
        id: convId,
        accountUsername: username,
        participantUsernames,
        lastDmAt: latest.created_at,
        lastDmPreview: preview,
        detectedTgHandles,
        syncedAt: now,
      }).run();
    }

    // Upsert events + emit events for new messages
    for (const ev of conv.events!) {
      const existingEv = db
        .select({ id: dmEvents.id })
        .from(dmEvents)
        .where(eq(dmEvents.id, ev.id))
        .get();

      if (!existingEv) {
        db.insert(dmEvents).values({
          id: ev.id,
          conversationId: convId,
          senderId: ev.sender_id,
          senderUsername: userMap.get(ev.sender_id) ?? null,
          text: ev.text ?? null,
          eventType: ev.event_type,
          createdAt: ev.created_at,
          syncedAt: now,
        }).run();
        syncedEvents++;

        // Emit dmReplyReceived if sender is a known lead
        const senderUsername = userMap.get(ev.sender_id);
        if (senderUsername && ev.text) {
          const leadId = leadHandleSet.get(senderUsername.toLowerCase());
          if (leadId) {
            try {
              await ctx.events.emit(EVENT_NAMES.dmReplyReceived, "", {
                leadId,
                handle: senderUsername,
                text: ev.text,
                conversationId: convId,
                eventId: ev.id,
                accountUsername: username,
              });
            } catch (emitErr) {
              ctx.logger.error(`[dm-sync] Event emit failed for dmReplyReceived: ${emitErr}`);
            }
          }
        }
      }
    }

    // Emit tgHandleDetected for any new TG handles found
    if (conv.allTgHandles.size > 0) {
      for (const tgHandle of conv.allTgHandles) {
        const senderUsernames = [...conv.participants].filter((p) => p !== username);
        try {
          await ctx.events.emit(EVENT_NAMES.tgHandleDetected, "", {
            tgHandle,
            conversationId: convId,
            accountUsername: username,
            participants: senderUsernames,
          });
        } catch (emitErr) {
          ctx.logger.error(`[dm-sync] Event emit failed for tgHandleDetected: ${emitErr}`);
        }
      }
    }
  }

  ctx.logger.info(
    `[dm-sync] @${username}: synced ${syncedEvents} new events across ${convMap.size} conversations`
  );
}
