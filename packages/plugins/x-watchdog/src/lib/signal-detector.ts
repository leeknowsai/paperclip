// Matches scored tweets against project trigger keywords and classifies signal type.

export type SignalType =
  | "product_launch"
  | "feature_update"
  | "partnership"
  | "milestone"
  | "campaign_event"
  | "fundraising"
  | "general";

export interface ProjectConfig {
  id: string;
  name: string;
  triggerKeywords: string[] | null;
  scoringPrompt: string | null;
  outreachChannels: string[] | null;
  outreachTemplates: Record<string, string> | null;
  projectDocs: string | null;
  tgTopicId: number | null;
}

interface ScoredTweet {
  id: string;
  content: string;
  handleId: string;
  username: string;
  aiScore: number;
}

export interface DetectedSignal {
  tweet: ScoredTweet;
  project: ProjectConfig;
  matchedKeywords: string[];
}

/** Check if a tweet matches any project's trigger keywords.
 *  Returns signals for all matching projects (a tweet can match multiple). */
export function detectSignals(
  tweets: ScoredTweet[],
  projectConfigs: ProjectConfig[],
  scoreThreshold: number = 0.6
): DetectedSignal[] {
  const signals: DetectedSignal[] = [];

  for (const tweet of tweets) {
    if (tweet.aiScore < scoreThreshold) continue;

    const textLower = tweet.content.toLowerCase();

    for (const project of projectConfigs) {
      if (!project.triggerKeywords?.length) continue;

      const matched = project.triggerKeywords.filter((kw) =>
        textLower.includes(kw.toLowerCase())
      );

      if (matched.length > 0) {
        signals.push({ tweet, project, matchedKeywords: matched });
      }
    }
  }

  return signals;
}
