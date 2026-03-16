/**
 * Tool: send-reply
 * Post a reply to a tweet using a stored OAuth 2.0 access token.
 * Ported from x-watchdog/src/worker/lib/x-write.ts postReply logic.
 */

import type { PluginContext, ToolRunContext, ToolResult } from "@paperclipai/plugin-sdk";
import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { actionLog } from "../db/schema.js";
import { getOAuthToken } from "../lib/oauth-utils.js";

export async function handleSendReply(
  ctx: PluginContext,
  params: unknown,
  _runCtx: ToolRunContext,
): Promise<ToolResult> {
  const { tweetId, message, dryRun } = params as {
    tweetId: string;
    message: string;
    dryRun?: boolean;
  };

  if (!tweetId) return { content: JSON.stringify({ error: "tweetId is required" }) };
  if (!message) return { content: JSON.stringify({ error: "message is required" }) };

  const db = getDb();
  const now = new Date().toISOString();
  const logId = `reply_${tweetId}_${Date.now()}`;

  if (dryRun) {
    ctx.logger.info(`[send-reply] DRY RUN — tweetId=${tweetId} message="${message}"`);
    await db.insert(actionLog).values({
      id: logId,
      actionType: "reply",
      targetTweetId: tweetId,
      content: message,
      status: "dry_run",
      createdAt: now,
    }).onConflictDoNothing();
    return {
      content: JSON.stringify({ ok: true, dryRun: true, tweetId, message }),
    };
  }

  let accessToken: string;
  let username: string;
  try {
    ({ accessToken, username } = await getOAuthToken(ctx));
  } catch (e: any) {
    return { content: JSON.stringify({ error: e.message }) };
  }

  // Insert pending log entry
  await db.insert(actionLog).values({
    id: logId,
    actionType: "reply",
    targetTweetId: tweetId,
    targetUsername: username,
    content: message,
    status: "pending",
    createdAt: now,
  }).onConflictDoNothing();

  let xId: string | undefined;
  try {
    const res = await fetch("https://api.x.com/2/tweets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: message,
        reply: { in_reply_to_tweet_id: tweetId },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      await db
        .update(actionLog)
        .set({ status: "failed", error: errText, completedAt: new Date().toISOString() })
        .where(eq(actionLog.id, logId));
      return {
        content: JSON.stringify({
          error: `X API reply failed (${res.status}): ${errText}`,
        }),
      };
    }

    const data = (await res.json()) as { data?: { id: string } };
    xId = data.data?.id;
  } catch (e: any) {
    return { content: JSON.stringify({ error: `Network error: ${e.message}` }) };
  }

  await db
    .update(actionLog)
    .set({
      xResponseId: xId,
      status: "sent",
      completedAt: new Date().toISOString(),
    })
    .where(eq(actionLog.id, logId));

  ctx.logger.info(`[send-reply] Replied to ${tweetId} as @${username}, xId=${xId}`);

  return {
    content: JSON.stringify({ ok: true, tweetId, xReplyId: xId, username }),
  };
}
