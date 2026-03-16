/**
 * Tool: search-x
 * Search X for tweets matching a query via the X API, AI-score results, store found handles/tweets.
 * Ported from x-search plugin scraper + x-watchdog API logic.
 */

import type { PluginContext, ToolRunContext, ToolResult } from "@paperclipai/plugin-sdk";
import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { handles, tweets } from "../db/schema.js";
import { resolveConfig } from "../lib/config.js";
import { createXDataRouter } from "../lib/x-data-router.js";
import { createLlmClient } from "../lib/llm-providers.js";

export async function handleSearchX(
  ctx: PluginContext,
  params: unknown,
  _runCtx: ToolRunContext,
): Promise<ToolResult> {
  const { query, projectId, limit } = params as {
    query: string;
    projectId?: string;
    limit?: number;
  };

  if (!query) return { content: JSON.stringify({ error: "query is required" }) };

  const config = await resolveConfig(ctx);
  if (!config.xBearerToken) {
    return { content: JSON.stringify({ error: "xBearerToken not configured" }) };
  }

  const router = createXDataRouter({
    xBearerToken: config.xBearerToken,
    twitterApiIoKey: config.twitterApiIoKey,
  });

  const { data: searchResult, source } = await router.searchTweets(query);
  if (!searchResult || searchResult.tweets.length === 0) {
    return {
      content: JSON.stringify({ ok: true, found: 0, stored: 0, scored: 0, source }),
    };
  }

  const maxResults = limit ?? 20;
  const batch = searchResult.tweets.slice(0, maxResults);
  const db = getDb();
  let stored = 0;

  // Ensure each author has a handle row, then insert tweets
  for (const t of batch) {
    // Resolve authorId → username via handle lookup or best-effort
    const authorId = t.authorId;

    // Try to find an existing handle by authorId
    let existingHandle = await db
      .select({ id: handles.id, username: handles.username })
      .from(handles)
      .where(eq(handles.id, authorId))
      .get();

    if (!existingHandle) {
      // Insert a stub handle so we can store the tweet
      try {
        await db.insert(handles).values({
          id: authorId,
          username: authorId, // temporary — enrichment job will update
          active: true,
          addedAt: new Date(),
          updatedAt: new Date(),
        }).onConflictDoNothing();
        existingHandle = { id: authorId, username: authorId };
      } catch {
        // skip this tweet if we can't create the handle
        continue;
      }
    }

    try {
      await db.insert(tweets).values({
        id: t.id,
        handleId: existingHandle.id,
        content: t.text,
        createdAt: t.createdAt ? new Date(t.createdAt) : new Date(),
        fetchedAt: new Date(),
        updatedAt: new Date(),
      }).onConflictDoNothing();
      stored++;
    } catch {
      // duplicate — skip
    }
  }

  // AI score the stored tweets (best-effort)
  let scored = 0;
  if (config.openaiApiKey && batch.length > 0) {
    try {
      const llm = createLlmClient(
        { OPENAI_API_KEY: config.openaiApiKey },
        "openai",
        "gpt-4.1-mini",
      );
      const userMsg = batch
        .map((t) => `[${t.id}] "${t.text}"`)
        .join("\n\n");
      const raw = await llm.chatCompletion({
        systemPrompt:
          'Score each tweet 0-10 for crypto BD relevance. Return JSON: {"results":[{"id":"..","score":N,"summary":"..","tags":[]}]}',
        userMessage: `Score these tweets:\n\n${userMsg}`,
        temperature: 0.1,
        maxTokens: 1000,
        jsonMode: true,
      });
      if (raw) {
        const parsed = JSON.parse(raw) as {
          results: { id: string; score: number; summary: string; tags: string[] }[];
        };
        for (const r of parsed.results ?? []) {
          await db
            .update(tweets)
            .set({
              aiScore: r.score / 10,
              aiSummary: r.summary,
              aiTags: JSON.stringify(r.tags),
              updatedAt: new Date(),
            })
            .where(eq(tweets.id, r.id));
          scored++;
        }
      }
    } catch (e: any) {
      ctx.logger.warn(`[search-x] AI scoring failed: ${e.message}`);
    }
  }

  return {
    content: JSON.stringify({
      ok: true,
      query,
      source,
      found: batch.length,
      stored,
      scored,
      projectId: projectId ?? null,
    }),
  };
}
