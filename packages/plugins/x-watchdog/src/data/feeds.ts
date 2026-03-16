// Data handler: feeds — paginated tweet feed with handle info.
// Ported from GET /api/tweets in src/worker/api/tweets.ts

import { and, desc, eq, gt, gte, like, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { handles, tweets } from "../db/schema.js";

export async function feedsHandler(params: Record<string, unknown>) {
  const db = getDb();
  const page = Math.max(1, Number(params.page ?? 1));
  const limit = Math.min(Number(params.limit ?? 50), 200);
  const minScore = Number(params.minScore ?? 0);
  const handle = params.handle as string | undefined;
  const category = params.category as string | undefined;
  const q = params.q as string | undefined;
  const sort = (params.sort as string) ?? "newest";
  const updatedAfter = params.updatedAfter as string | undefined;
  const projectId = params.projectId as string | undefined;

  const conditions: ReturnType<typeof eq>[] = [];
  if (minScore > 0) conditions.push(gte(tweets.aiScore, minScore) as any);
  if (updatedAfter) conditions.push(gt(tweets.updatedAt, new Date(updatedAfter)) as any);
  if (handle) conditions.push(eq(tweets.handleId, handle) as any);
  if (q) conditions.push(like(tweets.content, `%${q}%`) as any);
  if (category) conditions.push(eq(handles.category, category) as any);
  if (projectId) {
    const ids = (projectId as string).split(",").map((s) => s.trim()).filter(Boolean);
    conditions.push(
      sql`${tweets.handleId} IN (
        SELECT ph.handle_id FROM project_handles ph
        WHERE ph.project_id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
      )` as any
    );
  }

  let query = db
    .select({
      id: tweets.id,
      content: tweets.content,
      createdAt: tweets.createdAt,
      fetchedAt: tweets.fetchedAt,
      aiScore: tweets.aiScore,
      aiSummary: tweets.aiSummary,
      aiTags: tweets.aiTags,
      notified: tweets.notified,
      handleId: tweets.handleId,
      username: handles.username,
      displayName: handles.displayName,
      category: handles.category,
      projectIds: sql<string>`(
        SELECT GROUP_CONCAT(ph.project_id)
        FROM project_handles ph
        WHERE ph.handle_id = ${tweets.handleId}
      )`.as("projectIds"),
    })
    .from(tweets)
    .leftJoin(handles, eq(tweets.handleId, handles.id))
    .$dynamic();

  if (conditions.length) query = query.where(and(...(conditions as any[])));
  if (sort === "score") {
    query = query.orderBy(desc(tweets.aiScore));
  } else {
    query = query.orderBy(desc(tweets.createdAt));
  }

  const results = query.limit(limit).offset((page - 1) * limit).all();
  return { data: results, page, limit };
}
