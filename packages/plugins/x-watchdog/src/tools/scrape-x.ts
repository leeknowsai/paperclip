/**
 * Tool: scrape-x
 * Fetch and enrich an X profile (bio, followers, recent tweets).
 * Ported from x-search plugin chrome/scraper logic.
 */

import type { PluginContext, ToolRunContext, ToolResult } from "@paperclipai/plugin-sdk";
import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { handles, tweets } from "../db/schema.js";
import { resolveConfig } from "../lib/config.js";
import { createXDataRouter } from "../lib/x-data-router.js";

export async function handleScrapeX(
  ctx: PluginContext,
  params: unknown,
  _runCtx: ToolRunContext,
): Promise<ToolResult> {
  const { username } = params as { username: string };

  if (!username) return { content: JSON.stringify({ error: "username is required" }) };

  const config = await resolveConfig(ctx);
  if (!config.xBearerToken) {
    return { content: JSON.stringify({ error: "xBearerToken not configured" }) };
  }

  const router = createXDataRouter({
    xBearerToken: config.xBearerToken,
    twitterApiIoKey: config.twitterApiIoKey,
  });

  // Fetch profile
  const { profile, source: profileSource } = await router.lookupUser(username);
  if (!profile) {
    return {
      content: JSON.stringify({ error: `Could not fetch profile for @${username}` }),
    };
  }

  // Upsert handle with enrichment
  const db = getDb();
  const now = new Date();

  const existing = await db
    .select({ id: handles.id })
    .from(handles)
    .where(eq(handles.id, profile.id))
    .get();

  if (existing) {
    await db
      .update(handles)
      .set({
        username: profile.username,
        displayName: profile.displayName,
        bio: profile.bio,
        followersCount: profile.followersCount,
        followingCount: profile.followingCount,
        xTweetCount: profile.tweetCount,
        location: profile.location,
        verified: profile.verified,
        profileImageUrl: profile.profileImageUrl,
        website: profile.website,
        xCreatedAt: profile.createdAt,
        enrichedAt: now,
        enrichmentSource: profileSource,
        updatedAt: now,
      })
      .where(eq(handles.id, profile.id));
  } else {
    await db.insert(handles).values({
      id: profile.id,
      username: profile.username,
      displayName: profile.displayName,
      bio: profile.bio,
      followersCount: profile.followersCount,
      followingCount: profile.followingCount,
      xTweetCount: profile.tweetCount,
      location: profile.location,
      verified: profile.verified,
      profileImageUrl: profile.profileImageUrl,
      website: profile.website,
      xCreatedAt: profile.createdAt,
      enrichedAt: now,
      enrichmentSource: profileSource,
      active: true,
      addedAt: now,
      updatedAt: now,
    }).onConflictDoNothing();
  }

  // Fetch recent timeline tweets
  const { data: timeline, source: timelineSource } = await router.getUserTimeline(username);
  let tweetsFetched = 0;

  for (const t of timeline.tweets.slice(0, 20)) {
    try {
      await db.insert(tweets).values({
        id: t.id,
        handleId: profile.id,
        content: t.text,
        createdAt: t.createdAt ? new Date(t.createdAt) : now,
        fetchedAt: now,
        updatedAt: now,
      }).onConflictDoNothing();
      tweetsFetched++;
    } catch {
      // duplicate — skip
    }
  }

  ctx.logger.info(`[scrape-x] @${username}: profile enriched, ${tweetsFetched} tweets stored`);

  return {
    content: JSON.stringify({
      ok: true,
      username: profile.username,
      displayName: profile.displayName,
      bio: profile.bio,
      followersCount: profile.followersCount,
      tweetCount: profile.tweetCount,
      profileSource,
      timelineSource,
      tweetsFetched,
    }),
  };
}
