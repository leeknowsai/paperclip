import type { XDataProvider, XUserProfile, XSearchResult } from "./x-api.js";
import { createOfficialXProvider } from "./x-api.js";
import { createRapidApiProvider } from "./x-provider-rapidapi.js";
import { createTwitterApiIoProvider } from "./x-provider-twitterapiio.js";

export type XTask = "profile_lookup" | "timeline" | "search";

/**
 * Smart routing priority (cost-optimized):
 * - profile_lookup: rapidapi (free) → twitterapiio → official
 * - timeline:       rapidapi (free) → twitterapiio → official
 * - search:         twitterapiio (cheapest/tweet) → rapidapi → official
 */
const TASK_PRIORITY: Record<XTask, string[]> = {
  profile_lookup: ["rapidapi", "twitterapiio", "official"],
  timeline: ["rapidapi", "twitterapiio", "official"],
  search: ["twitterapiio", "rapidapi", "official"],
};

export interface XDataRouterKeys {
  xBearerToken: string;
  rapidApiKey?: string;
  twitterApiIoKey?: string;
}

/** Build available providers from explicit key params */
function buildProviders(keys: XDataRouterKeys): Map<string, XDataProvider> {
  const providers = new Map<string, XDataProvider>();

  // Official is always available (required key)
  providers.set("official", createOfficialXProvider(keys.xBearerToken));

  if (keys.rapidApiKey) {
    providers.set("rapidapi", createRapidApiProvider(keys.rapidApiKey));
  }
  if (keys.twitterApiIoKey) {
    providers.set("twitterapiio", createTwitterApiIoProvider(keys.twitterApiIoKey));
  }

  return providers;
}

/** Execute with automatic fallback on failure */
async function withFallback<T>(
  providers: Map<string, XDataProvider>,
  task: XTask,
  fn: (provider: XDataProvider) => Promise<T | null>
): Promise<{ result: T | null; source: string }> {
  const priority = TASK_PRIORITY[task];
  for (const name of priority) {
    const provider = providers.get(name);
    if (!provider) continue;
    try {
      const result = await fn(provider);
      if (result !== null) return { result, source: provider.name };
    } catch (err) {
      console.warn(`[x-router] ${provider.name} failed for ${task}:`, err);
    }
  }
  return { result: null, source: "none" };
}

/** Main router — call this from application code */
export function createXDataRouter(keys: XDataRouterKeys) {
  const providers = buildProviders(keys);

  return {
    /** Lookup user profile (enrichment) — tries cheapest first */
    async lookupUser(
      username: string
    ): Promise<{ profile: XUserProfile | null; source: string }> {
      const { result, source } = await withFallback(
        providers,
        "profile_lookup",
        (p) => p.lookupUser(username)
      );
      return { profile: result, source };
    },

    /** Get user timeline — tries cheapest first */
    async getUserTimeline(
      username: string,
      cursor?: string
    ): Promise<{ data: XSearchResult; source: string }> {
      const priority = TASK_PRIORITY.timeline;
      for (const name of priority) {
        const provider = providers.get(name);
        if (!provider) continue;
        try {
          const data = await provider.getUserTimeline(username, cursor);
          if (data.tweets.length > 0) return { data, source: provider.name };
        } catch (err) {
          console.warn(`[x-router] ${provider.name} timeline failed:`, err);
        }
      }
      return { data: { tweets: [] }, source: "none" };
    },

    /** Search tweets — tries cheapest per-tweet first */
    async searchTweets(
      query: string,
      cursor?: string
    ): Promise<{ data: XSearchResult; source: string }> {
      const priority = TASK_PRIORITY.search;
      for (const name of priority) {
        const provider = providers.get(name);
        if (!provider) continue;
        try {
          const data = await provider.searchTweets(query, cursor);
          if (data.tweets.length > 0) return { data, source: provider.name };
        } catch (err) {
          console.warn(`[x-router] ${provider.name} search failed:`, err);
        }
      }
      return { data: { tweets: [] }, source: "none" };
    },

    /** Get specific provider directly */
    getProvider(name: string): XDataProvider | undefined {
      return providers.get(name);
    },

    /** List available provider names */
    availableProviders(): string[] {
      return [...providers.keys()];
    },
  };
}

export type XDataRouter = ReturnType<typeof createXDataRouter>;
