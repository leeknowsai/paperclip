// Data handlers: insights — conversion funnel, conversation timeline,
// retrospectives list, template performance metrics.

import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import {
  leads,
  outreachLog,
  dmConversations,
  dmEvents,
  tgGroupMessages,
  outreachRetrospectives,
} from "../db/schema.js";

/**
 * conversion-funnel: leads grouped by status with counts.
 * Optional projectId filter.
 */
export async function conversionFunnelHandler(params: Record<string, unknown>) {
  const db = getDb();
  const projectId = params.projectId as string | undefined;

  const conditions: any[] = [];
  if (projectId) conditions.push(eq(leads.projectId, projectId));
  const where = conditions.length ? and(...conditions) : undefined;

  const rows = db
    .select({
      status: leads.status,
      count: sql<number>`count(*)`,
    })
    .from(leads)
    .where(where)
    .groupBy(leads.status)
    .all();

  return { funnel: rows };
}

/**
 * conversation-timeline: stitch a single lead's journey (tweet -> outreach -> DM -> TG).
 * Returns a chronological list of events.
 */
export async function conversationTimelineHandler(params: Record<string, unknown>) {
  const db = getDb();
  const leadId = params.leadId as string | undefined;
  if (!leadId) throw new Error("leadId required");

  // Get lead details
  const lead = db.select().from(leads).where(eq(leads.id, leadId)).get();
  if (!lead) return { error: "Lead not found" };

  const timeline: Array<{
    type: string;
    timestamp: string | number | null;
    channel?: string;
    content?: string | null;
    status?: string;
  }> = [];

  // Lead created event
  timeline.push({
    type: "lead_created",
    timestamp: lead.createdAt ? (lead.createdAt as Date).getTime() / 1000 : null,
    content: `Signal: ${lead.signalType ?? "unknown"} | Urgency: ${lead.urgency}`,
    status: lead.status,
  });

  // Outreach log entries
  const logEntries = db
    .select()
    .from(outreachLog)
    .where(eq(outreachLog.leadId, leadId))
    .orderBy(outreachLog.createdAt)
    .all();

  for (const entry of logEntries) {
    timeline.push({
      type: "outreach",
      timestamp: entry.createdAt ? (entry.createdAt as Date).getTime() / 1000 : null,
      channel: entry.channel,
      content: entry.message,
      status: entry.status,
    });
  }

  // DM conversations — find by matching handle in participant_usernames
  const handle = lead.handle;
  const dmConvos = db
    .select()
    .from(dmConversations)
    .where(sql`${dmConversations.participantUsernames} LIKE ${"%" + handle + "%"}`)
    .all();

  for (const convo of dmConvos) {
    const events = db
      .select()
      .from(dmEvents)
      .where(eq(dmEvents.conversationId, convo.id))
      .orderBy(dmEvents.createdAt)
      .all();

    for (const evt of events) {
      timeline.push({
        type: "dm",
        timestamp: evt.createdAt,
        channel: "x_dm",
        content: evt.text,
      });
    }
  }

  // TG group messages from this handle's TG username (if detected)
  if (lead.detectedTgHandle) {
    const tgMessages = db
      .select()
      .from(tgGroupMessages)
      .where(eq(tgGroupMessages.senderUsername, lead.detectedTgHandle))
      .orderBy(tgGroupMessages.createdAt)
      .all();

    for (const msg of tgMessages) {
      timeline.push({
        type: "tg_message",
        timestamp: msg.createdAt ? (msg.createdAt as Date).getTime() / 1000 : null,
        channel: "telegram",
        content: msg.text,
      });
    }
  }

  // Sort chronologically (coerce to numbers for comparison)
  timeline.sort((a, b) => {
    const ta = typeof a.timestamp === "number" ? a.timestamp : Number(a.timestamp ?? 0);
    const tb = typeof b.timestamp === "number" ? b.timestamp : Number(b.timestamp ?? 0);
    return ta - tb;
  });

  return { lead, timeline };
}

/**
 * retrospectives: list retrospective reports, ordered by createdAt DESC.
 */
export async function retrospectivesHandler(params: Record<string, unknown>) {
  const db = getDb();
  const page = Math.max(1, Number(params.page ?? 1));
  const limit = Math.min(Number(params.limit ?? 20), 100);
  const offset = (page - 1) * limit;
  const projectId = params.projectId as string | undefined;

  const conditions: any[] = [];
  if (projectId) conditions.push(eq(outreachRetrospectives.projectId, projectId));
  const where = conditions.length ? and(...conditions) : undefined;

  const rows = db
    .select()
    .from(outreachRetrospectives)
    .where(where)
    .orderBy(desc(outreachRetrospectives.createdAt))
    .limit(limit)
    .offset(offset)
    .all();

  const countResult = db
    .select({ count: sql<number>`count(*)` })
    .from(outreachRetrospectives)
    .where(where)
    .get();

  return {
    retrospectives: rows,
    total: countResult?.count ?? 0,
    page,
    totalPages: Math.ceil((countResult?.count ?? 0) / limit),
  };
}

/**
 * template-performance: aggregate outreach log by channel + message template,
 * cross-referenced with lead outcomes, to compute conversion rates.
 */
export async function templatePerformanceHandler(params: Record<string, unknown>) {
  const db = getDb();
  const projectId = params.projectId as string | undefined;

  // Use raw SQL for the aggregation join
  const projectFilter = projectId
    ? sql` AND l.project_id = ${projectId}`
    : sql``;

  const rows = db.all(sql`
    SELECT
      ol.channel,
      SUBSTR(ol.message, 1, 80) AS template_preview,
      COUNT(*) AS sent_count,
      SUM(CASE WHEN l.status = 'converted' THEN 1 ELSE 0 END) AS converted_count,
      ROUND(
        CAST(SUM(CASE WHEN l.status = 'converted' THEN 1 ELSE 0 END) AS REAL)
        / NULLIF(COUNT(*), 0) * 100,
        1
      ) AS conversion_rate
    FROM outreach_log ol
    LEFT JOIN leads l ON l.id = ol.lead_id
    WHERE ol.action = 'sent'${projectFilter}
    GROUP BY ol.channel, template_preview
    ORDER BY sent_count DESC
    LIMIT 50
  `);

  return { templates: rows };
}
