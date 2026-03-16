export interface TweetDetail {
  id: string;
  text: string;
  authorId: string;
  authorUsername: string;
  authorName: string;
  authorBio: string;
  authorFollowers: number;
  metrics: {
    likes: number;
    retweets: number;
    replies: number;
    views: number;
  };
  createdAt: string;
}

export interface ConversationReply {
  id: string;
  text: string;
  authorUsername: string;
  authorName: string;
  authorBio: string;
  authorFollowers: number;
  metrics: {
    likes: number;
    retweets: number;
    replies: number;
  };
}

export interface TweetAnalysisData {
  tweet: TweetDetail;
  topReplies: ConversationReply[];
}

export async function fetchTweetDetail(
  tweetId: string,
  bearerToken: string
): Promise<TweetDetail | null> {
  const params = new URLSearchParams({
    "tweet.fields": "created_at,author_id,public_metrics",
    expansions: "author_id",
    "user.fields": "username,name,description,public_metrics",
  });

  const res = await fetch(
    `https://api.x.com/2/tweets/${tweetId}?${params}`,
    { headers: { Authorization: `Bearer ${bearerToken}` } }
  );

  if (res.status === 429) {
    console.warn("[tweet-analyzer] Rate limited on tweet fetch");
    return null;
  }
  if (!res.ok) {
    console.error(`[tweet-analyzer] Tweet fetch failed: ${res.status}`);
    return null;
  }

  const data = (await res.json()) as {
    data?: {
      id: string;
      text: string;
      author_id: string;
      created_at: string;
      public_metrics?: {
        like_count: number;
        retweet_count: number;
        reply_count: number;
        impression_count: number;
      };
    };
    includes?: {
      users?: Array<{
        id: string;
        username: string;
        name: string;
        description: string;
        public_metrics?: { followers_count: number };
      }>;
    };
  };

  if (!data.data) return null;

  const author = data.includes?.users?.find(
    (u) => u.id === data.data!.author_id
  );

  return {
    id: data.data.id,
    text: data.data.text,
    authorId: data.data.author_id,
    authorUsername: author?.username ?? "unknown",
    authorName: author?.name ?? "Unknown",
    authorBio: author?.description ?? "",
    authorFollowers: author?.public_metrics?.followers_count ?? 0,
    metrics: {
      likes: data.data.public_metrics?.like_count ?? 0,
      retweets: data.data.public_metrics?.retweet_count ?? 0,
      replies: data.data.public_metrics?.reply_count ?? 0,
      views: data.data.public_metrics?.impression_count ?? 0,
    },
    createdAt: data.data.created_at,
  };
}

export async function fetchConversationReplies(
  tweetId: string,
  bearerToken: string,
  maxResults: number = 10
): Promise<ConversationReply[]> {
  const query = `conversation_id:${tweetId} is:reply`;
  const params = new URLSearchParams({
    query,
    "tweet.fields": "author_id,public_metrics",
    expansions: "author_id",
    "user.fields": "username,name,description,public_metrics",
    max_results: String(Math.min(maxResults, 100)),
    sort_order: "relevancy",
  });

  const res = await fetch(
    `https://api.x.com/2/tweets/search/recent?${params}`,
    { headers: { Authorization: `Bearer ${bearerToken}` } }
  );

  if (res.status === 429 || !res.ok) {
    console.warn(`[tweet-analyzer] Conversation fetch: ${res.status}`);
    return [];
  }

  const data = (await res.json()) as {
    data?: Array<{
      id: string;
      text: string;
      author_id: string;
      public_metrics?: {
        like_count: number;
        retweet_count: number;
        reply_count: number;
      };
    }>;
    includes?: {
      users?: Array<{
        id: string;
        username: string;
        name: string;
        description: string;
        public_metrics?: { followers_count: number };
      }>;
    };
  };

  if (!data.data) return [];

  const userMap = new Map(
    (data.includes?.users ?? []).map((u) => [u.id, u])
  );

  return data.data
    .map((t) => {
      const author = userMap.get(t.author_id);
      return {
        id: t.id,
        text: t.text,
        authorUsername: author?.username ?? "unknown",
        authorName: author?.name ?? "Unknown",
        authorBio: author?.description ?? "",
        authorFollowers: author?.public_metrics?.followers_count ?? 0,
        metrics: {
          likes: t.public_metrics?.like_count ?? 0,
          retweets: t.public_metrics?.retweet_count ?? 0,
          replies: t.public_metrics?.reply_count ?? 0,
        },
      };
    })
    .sort(
      (a, b) =>
        b.metrics.likes + b.metrics.replies - (a.metrics.likes + a.metrics.replies)
    )
    .slice(0, 10);
}

export async function fetchTweetAnalysisData(
  tweetId: string,
  bearerToken: string
): Promise<TweetAnalysisData | null> {
  const tweet = await fetchTweetDetail(tweetId, bearerToken);
  if (!tweet) return null;

  const topReplies = await fetchConversationReplies(tweetId, bearerToken);

  return { tweet, topReplies };
}
