// Data handler: leads — paginated BD lead list.
// Ported from GET /api/leads in src/worker/api/leads.ts

import { and, desc, eq, gt, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { leads, outreachLog } from "../db/schema.js";

export async function leadsHandler(params: Record<string, unknown>) {
  const db = getDb();
  const page = Math.max(1, Number(params.page ?? 1));
  const limit = Math.min(Number(params.limit ?? 20), 100);
  const offset = (page - 1) * limit;
  const projectId = params.projectId as string | undefined;
  const status = params.status as string | undefined;
  const urgency = params.urgency as string | undefined;
  const updatedAfter = params.updatedAfter as string | undefined;

  const conditions: any[] = [];
  if (projectId) conditions.push(eq(leads.projectId, projectId));
  if (status) conditions.push(eq(leads.status, status));
  if (urgency) conditions.push(eq(leads.urgency, urgency));
  if (updatedAfter) conditions.push(gt(leads.updatedAt, new Date(updatedAfter)));

  const where = conditions.length ? and(...conditions) : undefined;

  const rows = db
    .select()
    .from(leads)
    .where(where)
    .orderBy(desc(leads.createdAt))
    .limit(limit)
    .offset(offset)
    .all();

  const countResult = db
    .select({ count: sql<number>`count(*)` })
    .from(leads)
    .where(where)
    .get();

  const total = countResult?.count ?? 0;

  return {
    leads: rows,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

export async function leadDetailHandler(params: Record<string, unknown>) {
  const db = getDb();
  const id = params.id as string;
  if (!id) throw new Error("id required");

  const lead = db.select().from(leads).where(eq(leads.id, id)).get();
  if (!lead) return { error: "Lead not found" };

  const log = db
    .select()
    .from(outreachLog)
    .where(eq(outreachLog.leadId, id))
    .orderBy(desc(outreachLog.createdAt))
    .all();

  return { lead, outreachLog: log };
}
