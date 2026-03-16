import type { TweetAnalysisData } from "./tweet-analyzer.js";
import type { LlmClient } from "./llm-providers.js";

export interface OutreachSuggestion {
  tone: string;
  text: string;
}

export interface OutreachResult {
  summary: string;
  opportunityScore: number;
  tweetAuthor: {
    relevance: string;
    approach: "DM" | "public_reply" | "both";
    suggestedMessages: OutreachSuggestion[];
    talkingPoints: string[];
  };
  keyCommenters: Array<{
    handle: string;
    whyTarget: string;
    suggestedReplies: OutreachSuggestion[];
  }>;
  publicReply: {
    variants: OutreachSuggestion[];
    includeLink: string | null;
  };
  priority: "high" | "medium" | "low";
  recommendedActions: string[];
}

const OUTREACH_SYSTEM_PROMPT = `You are a Web3 BD strategist analyzing tweets for outreach opportunities.

TONE & STYLE:
- This is X (Twitter), NOT email. 1-2 sentences max per suggestion.
- Witty, playful, provocative. Roast culture welcome.
- Sarcasm, banter, subtle shade = good engagement on X.
- Match energy of the original tweet/thread.
- Never corporate or formal. No "Dear sir", no "synergies".
- Crypto twitter degen meets sharp BD operator.
- Provocative hot takes > polite introductions.
- If the tweet is mid, say so. If a commenter is wrong, dunk on them (tastefully).
- Project credibility = being funny/smart, not polite.

OUTPUT FORMAT:
Return a JSON object with this exact structure:
{
  "summary": "2-3 sentence opportunity overview",
  "opportunity_score": 1-10,
  "tweet_author": {
    "relevance": "why this person matters to our project",
    "approach": "DM" | "public_reply" | "both",
    "suggested_messages": [
      {"tone": "spicy", "text": "..."},
      {"tone": "friendly", "text": "..."},
      {"tone": "professional", "text": "..."}
    ],
    "talking_points": ["point1", "point2"]
  },
  "key_commenters": [
    {
      "handle": "@username",
      "why_target": "reason to engage",
      "suggested_replies": [
        {"tone": "spicy", "text": "..."},
        {"tone": "friendly", "text": "..."}
      ]
    }
  ],
  "public_reply": {
    "variants": [
      {"tone": "spicy", "text": "..."},
      {"tone": "friendly", "text": "..."}
    ],
    "include_link": "URL or null"
  },
  "priority": "high" | "medium" | "low",
  "recommended_actions": ["Step 1: ...", "Step 2: ...", "Step 3: ..."]
}`;

function parseAiResult(parsed: Record<string, unknown>): OutreachResult {
  return {
    summary: (parsed.summary as string) ?? "",
    opportunityScore: Math.max(1, Math.min(10, (parsed.opportunity_score as number) ?? 5)),
    tweetAuthor: {
      relevance: (parsed.tweet_author as Record<string, unknown>)?.relevance as string ?? "",
      approach: ((parsed.tweet_author as Record<string, unknown>)?.approach as string ?? "public_reply") as "DM" | "public_reply" | "both",
      suggestedMessages: ((parsed.tweet_author as Record<string, unknown>)?.suggested_messages as OutreachSuggestion[]) ?? [],
      talkingPoints: ((parsed.tweet_author as Record<string, unknown>)?.talking_points as string[]) ?? [],
    },
    keyCommenters: ((parsed.key_commenters as Array<Record<string, unknown>>) ?? []).map((c) => ({
      handle: (c.handle as string) ?? "",
      whyTarget: (c.why_target as string) ?? "",
      suggestedReplies: (c.suggested_replies as OutreachSuggestion[]) ?? [],
    })),
    publicReply: {
      variants: ((parsed.public_reply as Record<string, unknown>)?.variants as OutreachSuggestion[]) ?? [],
      includeLink: ((parsed.public_reply as Record<string, unknown>)?.include_link as string) ?? null,
    },
    priority: ((parsed.priority as string) ?? "medium") as "high" | "medium" | "low",
    recommendedActions: (parsed.recommended_actions as string[]) ?? [],
  };
}

export async function generateOutreachStrategy(
  llmClient: LlmClient,
  analysisData: TweetAnalysisData,
  projectPrompt?: string,
  temperature: number = 0.1
): Promise<OutreachResult | null> {
  const { tweet, topReplies } = analysisData;

  const tweetContext = [
    `TWEET by @${tweet.authorUsername} (${tweet.authorName})`,
    `Bio: ${tweet.authorBio}`,
    `Followers: ${tweet.authorFollowers.toLocaleString()}`,
    `Content: "${tweet.text}"`,
    `Metrics: ${tweet.metrics.likes} likes, ${tweet.metrics.retweets} RTs, ${tweet.metrics.replies} replies, ${tweet.metrics.views} views`,
  ].join("\n");

  const repliesContext = topReplies.length
    ? topReplies
        .map(
          (r) =>
            `@${r.authorUsername} (${r.authorFollowers} followers): "${r.text}" [${r.metrics.likes} likes]`
        )
        .join("\n")
    : "No notable replies yet.";

  const systemPrompt = projectPrompt
    ? `${projectPrompt}\n\n${OUTREACH_SYSTEM_PROMPT}`
    : OUTREACH_SYSTEM_PROMPT;

  const userMsg = `Analyze this tweet and generate outreach strategy:\n\n${tweetContext}\n\nTOP REPLIES:\n${repliesContext}\n\nReturn JSON only.`;

  try {
    const content = await llmClient.chatCompletion({
      systemPrompt,
      userMessage: userMsg,
      temperature,
      maxTokens: 2000,
      jsonMode: true,
    });

    if (!content) return null;

    const parsed = JSON.parse(content);
    return parseAiResult(parsed);
  } catch (err) {
    // Retry once on timeout or transient error
    if (
      err instanceof Error &&
      (err.message.includes("timeout") || err.message.includes("ECONNRESET"))
    ) {
      console.warn("[outreach-ai] Retrying after transient error...");
      try {
        const retryContent = await llmClient.chatCompletion({
          systemPrompt,
          userMessage: userMsg,
          temperature,
          maxTokens: 2000,
          jsonMode: true,
        });
        if (retryContent) {
          const parsed = JSON.parse(retryContent);
          return parseAiResult(parsed);
        }
      } catch (retryErr) {
        console.error("[outreach-ai] Retry also failed:", retryErr);
      }
    }
    console.error("[outreach-ai] Failed to generate strategy:", err);
    return null;
  }
}
