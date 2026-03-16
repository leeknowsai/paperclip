import type { XDataProvider, XUserProfile, XSearchResult, XTimelineTweet } from "./x-api.js";

const BASE_URL = "https://twitter-api45.p.rapidapi.com";

function headers(apiKey: string) {
  return {
    "x-rapidapi-host": "twitter-api45.p.rapidapi.com",
    "x-rapidapi-key": apiKey,
    "Content-Type": "application/json",
  };
}

export function createRapidApiProvider(apiKey: string): XDataProvider {
  return {
    name: "rapidapi",

    async lookupUser(username: string): Promise<XUserProfile | null> {
      const res = await fetch(
        `${BASE_URL}/screenname.php?screenname=${encodeURIComponent(username)}`,
        { headers: headers(apiKey) }
      );
      if (!res.ok) {
        console.warn(`[rapidapi] User lookup failed: ${res.status}`);
        return null;
      }
      const data = await res.json() as Record<string, unknown>;
      if (data.error || data.detail || data.message) {
        console.warn(`[rapidapi] ${username}: ${data.error ?? data.detail ?? data.message}`);
        return null;
      }
      if (!data.rest_id && !data.id) {
        console.warn(`[rapidapi] ${username}: no id in response, keys: ${Object.keys(data).join(",")}`);
        return null;
      }

      return {
        id: String(data.rest_id ?? data.id ?? ""),
        username: String(data.screen_name ?? data.username ?? username),
        displayName: String(data.name ?? ""),
        bio: String(data.description ?? data.desc ?? ""),
        followersCount: Number(data.followers_count ?? data.sub_count ?? 0),
        followingCount: Number(data.following_count ?? data.friends_count ?? 0),
        tweetCount: Number(data.statuses_count ?? data.media_count ?? 0),
        location: String(data.location ?? ""),
        verified: Boolean(data.verified ?? data.is_blue_verified ?? false),
        profileImageUrl: String(data.profile_image_url_https ?? data.avatar ?? ""),
        website: String(
          (data.entities as Record<string, unknown>)?.url
            ? ""
            : (data.url ?? data.website ?? "")
        ),
        createdAt: String(data.created_at ?? ""),
      };
    },

    async getUserTimeline(username: string, cursor?: string): Promise<XSearchResult> {
      const params = new URLSearchParams({ screenname: username });
      if (cursor) params.set("cursor", cursor);

      const res = await fetch(`${BASE_URL}/timeline.php?${params}`, {
        headers: headers(apiKey),
      });
      if (!res.ok) {
        console.warn(`[rapidapi] Timeline failed: ${res.status}`);
        return { tweets: [] };
      }

      const data = await res.json() as {
        timeline?: Array<Record<string, unknown>>;
        next_cursor?: string;
      };

      const tweets: XTimelineTweet[] = (data.timeline ?? []).map((t) => ({
        id: String(t.tweet_id ?? t.id ?? ""),
        text: String(t.text ?? ""),
        authorId: String(t.user_id ?? t.author_id ?? ""),
        createdAt: String(t.created_at ?? ""),
        metrics: {
          likes: Number(t.favorites ?? t.favorite_count ?? 0),
          retweets: Number(t.retweets ?? t.retweet_count ?? 0),
          replies: Number(t.replies ?? t.reply_count ?? 0),
          views: Number(t.views ?? 0),
        },
      }));

      return { tweets, nextCursor: data.next_cursor ?? undefined };
    },

    async searchTweets(query: string, cursor?: string): Promise<XSearchResult> {
      const params = new URLSearchParams({ query });
      if (cursor) params.set("cursor", cursor);

      const res = await fetch(`${BASE_URL}/search.php?${params}`, {
        headers: headers(apiKey),
      });
      if (!res.ok) {
        console.warn(`[rapidapi] Search failed: ${res.status}`);
        return { tweets: [] };
      }

      const data = await res.json() as {
        timeline?: Array<Record<string, unknown>>;
        next_cursor?: string;
      };

      const tweets: XTimelineTweet[] = (data.timeline ?? []).map((t) => ({
        id: String(t.tweet_id ?? t.id ?? ""),
        text: String(t.text ?? ""),
        authorId: String(t.user_id ?? t.author_id ?? ""),
        createdAt: String(t.created_at ?? ""),
        metrics: {
          likes: Number(t.favorites ?? t.favorite_count ?? 0),
          retweets: Number(t.retweets ?? t.retweet_count ?? 0),
          replies: Number(t.replies ?? t.reply_count ?? 0),
          views: Number(t.views ?? 0),
        },
      }));

      return { tweets, nextCursor: data.next_cursor ?? undefined };
    },
  };
}
