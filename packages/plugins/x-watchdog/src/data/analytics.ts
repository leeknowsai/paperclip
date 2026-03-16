// Data handler: analytics — tweet volume by day, score distribution, top handles/tags.
// Ported from src/worker/api/analytics.ts

import { desc, eq, gte, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { handles, tweets } from "../db/schema.js";

function getPeriodStart(period: string): Date {
  const now = Date.now();
  const ms: Record<string, number> = {
    "24h": 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
    "30d": 30 * 24 * 60 * 60 * 1000,
  };
  return new Date(now - (ms[period] ?? ms["7d"]));
}

export async function analyticsHandler(params: Record<string, unknown>) {
  const db = getDb();
  const period = (params.period as string) ?? "7d";
  const limitTop = Math.min(Number(params.limit ?? 10), 50);
  const start = getPeriodStart(period);

  // Tweet volume by day
  const volume = db
    .select({
      day: sql<string>`date(${tweets.createdAt}, 'unixepoch')`.as("day"),
      count: sql<number>`count(*)`,
    })
    .from(tweets)
    .where(gte(tweets.createdAt, start))
    .groupBy(sql`day`)
    .orderBy(sql`day`)
    .all();

  // Score distribution
  const scores = db
    .select({
      bucket: sql<string>`case
        when ${tweets.aiScore} >= 0.7 then 'high'
        when ${tweets.aiScore} >= 0.4 then 'medium'
        else 'low'
      end`.as("bucket"),
      count: sql<number>`count(*)`,
    })
    .from(tweets)
    .where(gte(tweets.createdAt, start))
    .groupBy(sql`bucket`)
    .all();

  // Top handles by high-score tweet count
  const topHandles = db
    .select({
      handleId: tweets.handleId,
      username: handles.username,
      category: handles.category,
      highCount: sql<number>`count(*)`,
    })
    .from(tweets)
    .leftJoin(handles, eq(tweets.handleId, handles.id))
    .where(sql`${tweets.aiScore} >= 0.7 AND ${tweets.createdAt} >= ${start}`)
    .groupBy(tweets.handleId)
    .orderBy(desc(sql`count(*)`))
    .limit(limitTop)
    .all();

  // Top tags (aggregated in JS — SQLite JSON support is limited)
  const tagRows = db
    .select({ aiTags: tweets.aiTags })
    .from(tweets)
    .where(gte(tweets.createdAt, start))
    .all();

  const tagCounts = new Map<string, number>();
  for (const row of tagRows) {
    if (!row.aiTags) continue;
    try {
      const tags = JSON.parse(row.aiTags) as string[];
      for (const tag of tags) {
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
      }
    } catch {
      // skip malformed
    }
  }

  const topTags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([tag, count]) => ({ tag, count }));

  return { data: { volume, scores, topHandles, topTags, period } };
}
