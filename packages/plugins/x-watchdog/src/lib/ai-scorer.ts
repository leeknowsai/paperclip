import type OpenAI from "openai";

export interface ScoredTweet {
  tweetId: string;
  score: number;
  summary: string;
  tags: string[];
}

const DEFAULT_CRITERIA = `You are a crypto BD signal filter. Score each tweet 0-10 for business development relevance.

Scoring criteria:
- Partnership/integration announcements: 8-10
- Product launches, new features, protocol upgrades: 6-8
- Hiring, team changes, funding rounds: 5-7
- Market commentary, analysis: 2-4
- Shitposts, memes, personal, giveaways: 0-2

Respond with JSON: {"results": [{"id": "tweet_id", "score": N, "summary": "one-line", "tags": ["tag1"]}]}`;

function buildSystemPrompt(customPrompt?: string): string {
  if (!customPrompt) return DEFAULT_CRITERIA;
  return `${customPrompt}\n\n${DEFAULT_CRITERIA}`;
}

export async function scoreTweetBatch(
  openai: OpenAI,
  tweets: {
    id: string;
    content: string;
    username: string;
    category: string | null;
  }[],
  customPrompt?: string
): Promise<ScoredTweet[]> {
  const userMsg = tweets
    .map(
      (t) =>
        `[${t.id}] @${t.username} (${t.category ?? "unknown"}): "${t.content}"`
    )
    .join("\n\n");

  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: buildSystemPrompt(customPrompt) },
      {
        role: "user",
        content: `Score these tweets:\n\n${userMsg}\n\nReturn JSON: {"results": [...]}`,
      },
    ],
    temperature: 0.1,
    max_tokens: 1000,
  });

  const content = res.choices[0].message.content;
  if (!content) return [];

  try {
    const parsed = JSON.parse(content) as {
      results: { id: string; score: number; summary: string; tags: string[] }[];
    };
    return parsed.results.map((r) => ({
      tweetId: r.id,
      score: Math.max(0, Math.min(10, r.score)),
      summary: r.summary,
      tags: r.tags,
    }));
  } catch {
    console.error("Failed to parse AI scoring response:", content);
    return [];
  }
}
