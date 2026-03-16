/** Enriched user profile returned by any provider */
export interface XUserProfile {
  id: string;
  username: string;
  displayName: string;
  bio: string;
  followersCount: number;
  followingCount: number;
  tweetCount: number; // profile tweet count (stored as x_tweet_count in DB to avoid collision)
  location: string;
  verified: boolean;
  profileImageUrl: string;
  website: string;
  createdAt: string;
}

/** Timeline tweet from any provider */
export interface XTimelineTweet {
  id: string;
  text: string;
  authorId: string;
  createdAt: string;
  metrics?: {
    likes: number;
    retweets: number;
    replies: number;
    views: number;
  };
}

/** Search result from any provider */
export interface XSearchResult {
  tweets: XTimelineTweet[];
  nextCursor?: string;
}

/** Unified interface for Twitter data providers */
export interface XDataProvider {
  name: string;
  lookupUser(username: string): Promise<XUserProfile | null>;
  getUserTimeline(username: string, cursor?: string): Promise<XSearchResult>;
  searchTweets(query: string, cursor?: string): Promise<XSearchResult>;
}

export interface XTweet {
  id: string;
  text: string;
  author_id: string;
  created_at: string;
}

export interface XUser {
  id: string;
  username: string;
  name: string;
}

/** Build search queries from handles, staying under 480 char limit */
export function buildSearchQueries(handles: string[]): string[] {
  const queries: string[] = [];
  let current: string[] = [];

  for (const handle of handles) {
    const candidate = [...current, handle];
    const query = candidate.map((h) => `from:${h}`).join(" OR ");
    if (query.length > 480) {
      queries.push(current.map((h) => `from:${h}`).join(" OR "));
      current = [handle];
    } else {
      current = candidate;
    }
  }
  if (current.length) {
    queries.push(current.map((h) => `from:${h}`).join(" OR "));
  }
  return queries;
}

/** Search recent tweets via X API v2 */
export async function searchRecentTweets(
  query: string,
  sinceId: string | null,
  bearerToken: string
): Promise<XTweet[]> {
  const params = new URLSearchParams({
    query,
    "tweet.fields": "created_at,author_id",
    max_results: "100",
  });
  if (sinceId) params.set("since_id", sinceId);

  const res = await fetch(
    `https://api.x.com/2/tweets/search/recent?${params}`,
    { headers: { Authorization: `Bearer ${bearerToken}` } }
  );

  if (res.status === 429) {
    console.warn("X API rate limited, skipping batch");
    return [];
  }

  if (!res.ok) {
    throw new Error(`X API ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as { data?: XTweet[] };
  return data.data ?? [];
}

/** Fetch accounts a user follows (1 page, up to 1000) */
export async function fetchFollowing(
  userId: string,
  bearerToken: string
): Promise<XUser[]> {
  const params = new URLSearchParams({ max_results: "1000" });
  const res = await fetch(
    `https://api.x.com/2/users/${userId}/following?${params}`,
    { headers: { Authorization: `Bearer ${bearerToken}` } }
  );

  if (res.status === 429) {
    console.warn("X API rate limited on following fetch, skipping");
    return [];
  }

  if (!res.ok) {
    throw new Error(`X API following ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as { data?: XUser[] };
  return data.data ?? [];
}

/** Lookup X user by username */
export async function lookupXUser(
  username: string,
  bearerToken: string
): Promise<XUser | null> {
  const res = await fetch(
    `https://api.x.com/2/users/by/username/${username}`,
    { headers: { Authorization: `Bearer ${bearerToken}` } }
  );

  if (!res.ok) return null;

  const data = (await res.json()) as { data?: XUser };
  return data.data ?? null;
}

/** Wrap existing Official X API functions as XDataProvider */
export function createOfficialXProvider(bearerToken: string): XDataProvider {
  return {
    name: "official",

    async lookupUser(username: string): Promise<XUserProfile | null> {
      const params = new URLSearchParams({
        "user.fields":
          "description,public_metrics,location,verified,profile_image_url,url,created_at",
      });
      const res = await fetch(
        `https://api.x.com/2/users/by/username/${username}?${params}`,
        { headers: { Authorization: `Bearer ${bearerToken}` } }
      );
      if (!res.ok) return null;

      const data = (await res.json()) as {
        data?: {
          id: string;
          username: string;
          name: string;
          description?: string;
          public_metrics?: {
            followers_count: number;
            following_count: number;
            tweet_count: number;
          };
          location?: string;
          verified?: boolean;
          profile_image_url?: string;
          url?: string;
          created_at?: string;
        };
      };
      if (!data.data) return null;
      const u = data.data;

      return {
        id: u.id,
        username: u.username,
        displayName: u.name,
        bio: u.description ?? "",
        followersCount: u.public_metrics?.followers_count ?? 0,
        followingCount: u.public_metrics?.following_count ?? 0,
        tweetCount: u.public_metrics?.tweet_count ?? 0,
        location: u.location ?? "",
        verified: u.verified ?? false,
        profileImageUrl: u.profile_image_url ?? "",
        website: u.url ?? "",
        createdAt: u.created_at ?? "",
      };
    },

    async getUserTimeline(username: string): Promise<XSearchResult> {
      const tweets = await searchRecentTweets(`from:${username}`, null, bearerToken);
      return {
        tweets: tweets.map((t) => ({
          id: t.id,
          text: t.text,
          authorId: t.author_id,
          createdAt: t.created_at,
        })),
      };
    },

    async searchTweets(query: string): Promise<XSearchResult> {
      const tweets = await searchRecentTweets(query, null, bearerToken);
      return {
        tweets: tweets.map((t) => ({
          id: t.id,
          text: t.text,
          authorId: t.author_id,
          createdAt: t.created_at,
        })),
      };
    },
  };
}
