// Data handler: handles — paginated handle list with tweet counts.
// Ported from GET /api/handles in src/worker/api/handles.ts

import { and, eq, gt, like, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { handles, tweets } from "../db/schema.js";

export async function handlesHandler(params: Record<string, unknown>) {
  const db = getDb();
  const page = Math.max(1, Number(params.page ?? 1));
  const limit = Math.min(Number(params.limit ?? 100), 500);
  const category = params.category as string | undefined;
  const q = params.q as string | undefined;
  const updatedAfter = params.updatedAfter as string | undefined;
  const projectId = params.projectId as string | undefined;
  const enriched = params.enriched as string | undefined;

  const conditions: any[] = [];
  if (category) conditions.push(eq(handles.category, category));
  if (q) conditions.push(like(handles.username, `%${q}%`));
  if (updatedAfter) conditions.push(gt(handles.updatedAt, new Date(updatedAfter)));
  if (enriched === "true") conditions.push(sql`${handles.enrichedAt} IS NOT NULL`);
  if (enriched === "false") conditions.push(sql`${handles.enrichedAt} IS NULL`);
  if (projectId) {
    conditions.push(
      sql`${handles.id} IN (SELECT handle_id FROM project_handles WHERE project_id = ${projectId})`
    );
  }

  const where = conditions.length ? and(...conditions) : undefined;

  const totalResult = db
    .select({ c: sql<number>`count(*)` })
    .from(handles)
    .where(where)
    .get();
  const total = (totalResult?.c as number) ?? 0;

  const results = db
    .select()
    .from(handles)
    .where(where)
    .limit(limit)
    .offset((page - 1) * limit)
    .all();

  // Tweet counts per handle
  const tweetCounts = db
    .select({
      handleId: tweets.handleId,
      count: sql<number>`count(*)`,
    })
    .from(tweets)
    .groupBy(tweets.handleId)
    .all();

  const countMap = new Map(tweetCounts.map((r) => [r.handleId, r.count]));

  return {
    data: results.map((h) => ({ ...h, tweetCount: countMap.get(h.id) ?? 0 })),
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };
}
