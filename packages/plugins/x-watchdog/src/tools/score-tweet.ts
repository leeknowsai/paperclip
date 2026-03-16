/**
 * Tool: score-tweet
 * Fetch a tweet by ID, AI-score it for BD relevance, persist the score.
 */

import type { PluginContext, ToolRunContext, ToolResult } from "@paperclipai/plugin-sdk";
import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { tweets, projects } from "../db/schema.js";
import { resolveConfig } from "../lib/config.js";
import { createLlmClient } from "../lib/llm-providers.js";

export async function handleScoreTweet(
  ctx: PluginContext,
  params: unknown,
  _runCtx: ToolRunContext,
): Promise<ToolResult> {
  const { tweetId, projectId } = params as {
    tweetId: string;
    projectId?: string;
  };

  if (!tweetId) return { content: JSON.stringify({ error: "tweetId is required" }) };

  const config = await resolveConfig(ctx);
  if (!config.openaiApiKey) {
    return { content: JSON.stringify({ error: "openaiApiKey not configured" }) };
  }

  const db = getDb();

  // Fetch tweet from local DB
  const tweet = await db
    .select()
    .from(tweets)
    .where(eq(tweets.id, tweetId))
    .get();

  if (!tweet) {
    return {
      content: JSON.stringify({
        error: `Tweet ${tweetId} not found in local DB. Run scrape-x or search-x first.`,
      }),
    };
  }

  // Fetch project scoring prompt if projectId provided
  let scoringPrompt: string | null = null;
  if (projectId) {
    const project = await db
      .select({ scoringPrompt: projects.scoringPrompt })
      .from(projects)
      .where(eq(projects.id, projectId))
      .get();
    scoringPrompt = project?.scoringPrompt ?? null;
  }

  const systemPrompt = [
    scoringPrompt,
    "Score the following tweet 0-10 for crypto business development relevance.",
    "Return JSON: {\"score\": N, \"summary\": \"one-line\", \"tags\": [\"tag1\"]}",
  ]
    .filter(Boolean)
    .join("\n\n");

  const llm = createLlmClient(
    { OPENAI_API_KEY: config.openaiApiKey },
    "openai",
    "gpt-4.1-mini",
  );

  let score = 0;
  let summary = "";
  let tags: string[] = [];

  try {
    const raw = await llm.chatCompletion({
      systemPrompt,
      userMessage: `Tweet: "${tweet.content}"`,
      temperature: 0.1,
      maxTokens: 300,
      jsonMode: true,
    });

    if (raw) {
      const parsed = JSON.parse(raw) as {
        score: number;
        summary: string;
        tags: string[];
      };
      score = Math.max(0, Math.min(10, parsed.score ?? 0));
      summary = parsed.summary ?? "";
      tags = parsed.tags ?? [];
    }
  } catch (e: any) {
    return { content: JSON.stringify({ error: `AI scoring failed: ${e.message}` }) };
  }

  // Persist score back to tweet
  await db
    .update(tweets)
    .set({
      aiScore: score / 10,
      aiSummary: summary,
      aiTags: JSON.stringify(tags),
      updatedAt: new Date(),
    })
    .where(eq(tweets.id, tweetId));

  ctx.logger.info(`[score-tweet] ${tweetId}: score=${score}/10`);

  return {
    content: JSON.stringify({
      ok: true,
      tweetId,
      score,
      summary,
      tags,
      projectId: projectId ?? null,
    }),
  };
}
