// Data handler: dm-conversations — list DM conversations with optional filters.
// Ported from GET /api/dm/conversations in src/worker/api/dm.ts

import { and, desc, eq, gt, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { dmConversations, dmEvents } from "../db/schema.js";

export async function dmConversationsHandler(params: Record<string, unknown>) {
  const db = getDb();
  const page = Math.max(1, Number(params.page ?? 1));
  const limit = Math.min(Number(params.limit ?? 50), 200);
  const offset = (page - 1) * limit;
  const account = params.account as string | undefined;
  const projectId = params.projectId as string | undefined;
  const since = params.since as string | undefined;

  const conditions: any[] = [];
  if (account) conditions.push(eq(dmConversations.accountUsername, account));
  if (projectId) conditions.push(eq(dmConversations.projectId, projectId));
  if (since) conditions.push(gt(dmConversations.lastDmAt, since));

  const where = conditions.length ? and(...conditions) : undefined;

  const data = db
    .select()
    .from(dmConversations)
    .where(where)
    .orderBy(desc(sql`COALESCE(${dmConversations.lastDmAt}, '')`))
    .limit(limit)
    .offset(offset)
    .all();

  const countResult = db
    .select({ count: sql<number>`count(*)` })
    .from(dmConversations)
    .where(where)
    .get();

  return {
    data,
    page,
    limit,
    total: countResult?.count ?? 0,
  };
}

export async function dmConversationDetailHandler(params: Record<string, unknown>) {
  const db = getDb();
  const id = params.id as string;
  if (!id) throw new Error("id required");

  const conversation = db
    .select()
    .from(dmConversations)
    .where(eq(dmConversations.id, id))
    .get();

  if (!conversation) return { error: "Conversation not found" };

  const events = db
    .select()
    .from(dmEvents)
    .where(eq(dmEvents.conversationId, id))
    .orderBy(dmEvents.createdAt)
    .all();

  return { conversation, events };
}
