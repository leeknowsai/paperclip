/**
 * Tool: chrome-scrape
 * Scrapes X search tabs via CDP, dedupes, AI-scores, stores tweets, detects leads.
 */

import type { PluginContext, ToolRunContext, ToolResult } from "@paperclipai/plugin-sdk";
import { inArray } from "drizzle-orm";
import OpenAI from "openai";
import { getDb } from "../db/index.js";
import { handles, tweets, leads } from "../db/schema.js";
import { STATE_KEYS } from "../constants.js";
import { resolveConfig } from "../lib/config.js";
import { scoreTweetBatch } from "../lib/ai-scorer.js";
import type { TweetData, ScoredTweet } from "../lib/chrome/scraper.js";
import { searchXScrape } from "../lib/chrome/scraper.js";

export async function handleChromeScrape(
  ctx: PluginContext,
  params: unknown,
  _runCtx: ToolRunContext,
): Promise<ToolResult> {
  const { limit, skipScore } = (params ?? {}) as {
    limit?: number;
    skipScore?: boolean;
  };

  const raw = (await ctx.config.get()) as Record<string, unknown> | null;
  const cdpPort = (raw?.cdpPort as number | undefined) ?? 9222;

  const config = await resolveConfig(ctx);
  const logs: string[] = [];

  // Build ScraperDeps with DB-backed callbacks
  const db = getDb();

  const deps = {
    cdpPort,

    // Synchronous dedup — better-sqlite3 is sync
    checkExistingTweetIds: (ids: string[]): string[] => {
      if (ids.length === 0) return [];
      const rows = db
        .select({ id: tweets.id })
        .from(tweets)
        .where(inArray(tweets.id, ids))
        .all();
      return rows.map((r) => r.id);
    },

    // AI scoring — bridge TweetData[] → ScoredTweet[] (scraper type)
    scoreTweets: async (rawTweets: TweetData[]): Promise<ScoredTweet[]> => {
      if (!config.openaiApiKey) {
        return rawTweets.map((t) => ({ ...t, score: 0, summary: "", tags: [] }));
      }
      const openai = new OpenAI({ apiKey: config.openaiApiKey });
      const input = rawTweets.map((t) => ({
        id: t.tweetId,
        content: t.text,
        username: t.authorUsername,
        category: null as string | null,
      }));
      const scored = await scoreTweetBatch(openai, input);
      // Merge scores back onto full TweetData
      const scoreMap = new Map(scored.map((s) => [s.tweetId, s]));
      return rawTweets.map((t) => {
        const s = scoreMap.get(t.tweetId);
        return {
          ...t,
          score: s?.score ?? 0,
          summary: s?.summary ?? "",
          tags: s?.tags ?? [],
        };
      });
    },

    // Store tweets — create stub handles as needed, then insert tweet rows
    storeTweets: (scoredTweets: ScoredTweet[]): number => {
      const db2 = getDb();
      let inserted = 0;
      for (const t of scoredTweets) {
        // Ensure stub handle exists (use authorUsername as ID)
        const handleId = `chrome_${t.authorUsername}`;
        db2
          .insert(handles)
          .values({
            id: handleId,
            username: t.authorUsername,
            displayName: t.authorName,
            active: true,
            addedAt: new Date(),
            updatedAt: new Date(),
          })
          .onConflictDoNothing()
          .run();

        const result = db2
          .insert(tweets)
          .values({
            id: t.tweetId,
            handleId,
            content: t.text,
            createdAt: t.timestamp ? new Date(t.timestamp) : new Date(),
            fetchedAt: new Date(),
            aiScore: t.score / 10,
            aiSummary: t.summary,
            aiTags: JSON.stringify(t.tags),
            notified: false,
            updatedAt: new Date(),
          })
          .onConflictDoNothing()
          .run();

        if (result.changes > 0) inserted++;
      }
      return inserted;
    },

    // Lead detection — score >= 7 threshold
    detectAndCreateLeads: (scoredTweets: ScoredTweet[]): number => {
      const db2 = getDb();
      const threshold = (raw?.notificationThreshold as number | undefined) ?? 7;
      const highQuality = scoredTweets.filter((t) => t.score >= threshold);
      let created = 0;
      for (const t of highQuality) {
        const now = new Date();
        const result = db2
          .insert(leads)
          .values({
            id: `chrome_lead_${t.tweetId}`,
            handle: t.authorUsername,
            tweetId: t.tweetId,
            signalType: t.tags[0] ?? "chrome_search",
            status: "new",
            urgency: t.score >= 9 ? "hot" : "warm",
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoNothing()
          .run();
        if (result.changes > 0) created++;
      }
      return created;
    },
  };

  const result = await searchXScrape(
    deps,
    { limit, skipScore },
    (msg) => {
      ctx.logger.info(`[chrome-scrape] ${msg}`);
      logs.push(msg);
    },
  );

  // Save last scan timestamp
  await ctx.state.set(STATE_KEYS.chromeLastScan, {
    at: new Date().toISOString(),
    totalScraped: result.totalScraped,
    newTweets: result.newTweets,
    scored: result.scored,
    stored: result.stored,
    leadsCreated: result.leadsCreated,
  });

  return {
    content: JSON.stringify({
      ok: true,
      ...result,
      logs,
    }),
  };
}
