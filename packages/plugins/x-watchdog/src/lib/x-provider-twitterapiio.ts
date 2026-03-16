import type { XDataProvider, XUserProfile, XSearchResult, XTimelineTweet } from "./x-api.js";

const BASE_URL = "https://api.twitterapi.io/twitter";

function headers(apiKey: string) {
  return {
    "X-API-Key": apiKey,
    "Content-Type": "application/json",
  };
}

export function createTwitterApiIoProvider(apiKey: string): XDataProvider {
  return {
    name: "twitterapiio",

    async lookupUser(username: string): Promise<XUserProfile | null> {
      const res = await fetch(
        `${BASE_URL}/user/info?userName=${encodeURIComponent(username)}`,
        { headers: headers(apiKey) }
      );
      if (!res.ok) {
        console.warn(`[twitterapiio] User lookup failed: ${res.status}`);
        return null;
      }
      const data = await res.json() as { data?: Record<string, unknown> };
      const u = data.data;
      if (!u) return null;

      return {
        id: String(u.id ?? u.rest_id ?? ""),
        username: String(u.screen_name ?? u.username ?? username),
        displayName: String(u.name ?? ""),
        bio: String(u.description ?? ""),
        followersCount: Number(u.followers_count ?? 0),
        followingCount: Number(u.friends_count ?? u.following_count ?? 0),
        tweetCount: Number(u.statuses_count ?? 0),
        location: String(u.location ?? ""),
        verified: Boolean(u.verified ?? u.is_blue_verified ?? false),
        profileImageUrl: String(u.profile_image_url_https ?? ""),
        website: String(u.url ?? ""),
        createdAt: String(u.created_at ?? ""),
      };
    },

    async getUserTimeline(username: string, cursor?: string): Promise<XSearchResult> {
      const params = new URLSearchParams({ userName: username });
      if (cursor) params.set("cursor", cursor);

      const res = await fetch(`${BASE_URL}/user/last_tweets?${params}`, {
        headers: headers(apiKey),
      });
      if (!res.ok) {
        console.warn(`[twitterapiio] Timeline failed: ${res.status}`);
        return { tweets: [] };
      }

      const data = await res.json() as {
        data?: { tweets?: Array<Record<string, unknown>> };
        next_cursor?: string;
      };

      const tweets: XTimelineTweet[] = (data.data?.tweets ?? []).map((t) => ({
        id: String(t.id ?? t.tweet_id ?? ""),
        text: String(t.text ?? t.full_text ?? ""),
        authorId: String(t.author_id ?? ""),
        createdAt: String(t.created_at ?? ""),
        metrics: {
          likes: Number(t.favorite_count ?? t.likes ?? 0),
          retweets: Number(t.retweet_count ?? t.retweets ?? 0),
          replies: Number(t.reply_count ?? t.replies ?? 0),
          views: Number(t.views ?? t.impression_count ?? 0),
        },
      }));

      return { tweets, nextCursor: data.next_cursor ?? undefined };
    },

    async searchTweets(query: string, cursor?: string): Promise<XSearchResult> {
      const params = new URLSearchParams({ query, queryType: "Latest" });
      if (cursor) params.set("cursor", cursor);

      const res = await fetch(`${BASE_URL}/tweet/advanced_search?${params}`, {
        headers: headers(apiKey),
      });
      if (!res.ok) {
        console.warn(`[twitterapiio] Search failed: ${res.status}`);
        return { tweets: [] };
      }

      const data = await res.json() as {
        data?: { tweets?: Array<Record<string, unknown>> };
        next_cursor?: string;
      };

      const tweets: XTimelineTweet[] = (data.data?.tweets ?? []).map((t) => ({
        id: String(t.id ?? t.tweet_id ?? ""),
        text: String(t.text ?? t.full_text ?? ""),
        authorId: String(t.author_id ?? ""),
        createdAt: String(t.created_at ?? ""),
        metrics: {
          likes: Number(t.favorite_count ?? 0),
          retweets: Number(t.retweet_count ?? 0),
          replies: Number(t.reply_count ?? 0),
          views: Number(t.views ?? 0),
        },
      }));

      return { tweets, nextCursor: data.next_cursor ?? undefined };
    },
  };
}
