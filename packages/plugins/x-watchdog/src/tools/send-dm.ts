/**
 * Tool: send-dm
 * Send a Direct Message on X using a stored OAuth 2.0 access token.
 * Ported from x-watchdog/src/worker/lib/x-write.ts sendDM logic.
 */

import type { PluginContext, ToolRunContext, ToolResult } from "@paperclipai/plugin-sdk";
import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { actionLog, handles, outreachLog, leads } from "../db/schema.js";
import { resolveConfig } from "../lib/config.js";
import { getOAuthToken } from "../lib/oauth-utils.js";
import { lookupXUser } from "../lib/x-api.js";

export async function handleSendDm(
  ctx: PluginContext,
  params: unknown,
  _runCtx: ToolRunContext,
): Promise<ToolResult> {
  const { username, message, leadId, dryRun } = params as {
    username: string;
    message: string;
    leadId?: string;
    dryRun?: boolean;
  };

  if (!username) return { content: JSON.stringify({ error: "username is required" }) };
  if (!message) return { content: JSON.stringify({ error: "message is required" }) };

  const db = getDb();
  const now = new Date().toISOString();
  const logId = `dm_${username}_${Date.now()}`;

  if (dryRun) {
    ctx.logger.info(`[send-dm] DRY RUN — to=@${username} message="${message}"`);
    await db.insert(actionLog).values({
      id: logId,
      actionType: "dm",
      targetUsername: username,
      content: message,
      status: "dry_run",
      createdAt: now,
    }).onConflictDoNothing();
    return {
      content: JSON.stringify({ ok: true, dryRun: true, username, message }),
    };
  }

  let accessToken: string;
  let senderUsername: string;
  try {
    ({ accessToken, username: senderUsername } = await getOAuthToken(ctx));
  } catch (e: any) {
    return { content: JSON.stringify({ error: e.message }) };
  }

  // Resolve X user ID for DM endpoint
  const config = await resolveConfig(ctx);

  // Try local DB first
  let userId: string | undefined;
  const localHandle = await db
    .select({ id: handles.id })
    .from(handles)
    .where(eq(handles.username, username))
    .get();

  if (localHandle) {
    userId = localHandle.id;
  } else if (config.xBearerToken) {
    // Fallback to X API lookup
    const xUser = await lookupXUser(username, config.xBearerToken);
    if (xUser) userId = xUser.id;
  }

  if (!userId) {
    return {
      content: JSON.stringify({
        error: `Could not resolve user ID for @${username}. Run scrape-x first.`,
      }),
    };
  }

  // Insert pending log entry
  await db.insert(actionLog).values({
    id: logId,
    actionType: "dm",
    targetUserId: userId,
    targetUsername: username,
    content: message,
    status: "pending",
    createdAt: now,
  }).onConflictDoNothing();

  let conversationId: string | undefined;
  try {
    const res = await fetch(
      `https://api.x.com/2/dm_conversations/with/${userId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: message }),
      },
    );

    if (!res.ok) {
      const errText = await res.text();
      await db
        .update(actionLog)
        .set({ status: "failed", error: errText, completedAt: new Date().toISOString() })
        .where(eq(actionLog.id, logId));
      return {
        content: JSON.stringify({
          error: `X API DM failed (${res.status}): ${errText}`,
        }),
      };
    }

    const data = (await res.json()) as { data?: { dm_conversation_id: string } };
    conversationId = data.data?.dm_conversation_id ?? userId;
  } catch (e: any) {
    return { content: JSON.stringify({ error: `Network error: ${e.message}` }) };
  }

  await db
    .update(actionLog)
    .set({
      xResponseId: conversationId,
      status: "sent",
      completedAt: new Date().toISOString(),
    })
    .where(eq(actionLog.id, logId));

  // Log to outreach_log if leadId provided
  if (leadId) {
    await db.insert(outreachLog).values({
      id: `ol_${logId}`,
      leadId,
      channel: "x_dm",
      action: "sent",
      message,
      status: "delivered",
      createdAt: new Date(),
    }).onConflictDoNothing();
  }

  ctx.logger.info(
    `[send-dm] DM sent to @${username} (userId=${userId}) by @${senderUsername}, convId=${conversationId}`,
  );

  return {
    content: JSON.stringify({
      ok: true,
      username,
      userId,
      conversationId,
      senderUsername,
      leadId: leadId ?? null,
    }),
  };
}
