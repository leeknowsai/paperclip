/**
 * Tool: outreach-retrospective
 * Generate an AI retrospective analysis for closed/terminal leads.
 * Stitches conversation timeline, calls LLM for analysis, stores result.
 */

import type { PluginContext, ToolRunContext, ToolResult } from "@paperclipai/plugin-sdk";
import { eq, and, gte, inArray, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import {
  leads,
  outreachLog,
  dmConversations,
  dmEvents,
  outreachRetrospectives,
} from "../db/schema.js";
import { resolveConfig } from "../lib/config.js";
import { createLlmClient } from "../lib/llm-providers.js";
import { EVENT_NAMES } from "../constants.js";

const TERMINAL_STATUSES = ["converted", "cold", "declined", "rejected", "skipped"];

interface RetroParams {
  leadId?: string;
  outcome?: string;
  notes?: string;
  periodDays?: number;
  projectId?: string;
}

/**
 * Core retrospective logic — used by both the tool handler and the weekly job.
 */
export async function handleOutreachRetrospective(
  params: RetroParams,
  ctx: PluginContext,
): Promise<{ content: string; metadata?: Record<string, unknown> }> {
  const db = getDb();
  const config = await resolveConfig(ctx);

  if (!config.openaiApiKey) {
    return { content: JSON.stringify({ error: "openaiApiKey not configured" }) };
  }

  // Determine which leads to analyze
  let targetLeads: Array<typeof leads.$inferSelect>;

  if (params.leadId) {
    // Single lead mode (tool invocation)
    const lead = db.select().from(leads).where(eq(leads.id, params.leadId)).get();
    if (!lead) {
      return { content: JSON.stringify({ error: `Lead ${params.leadId} not found` }) };
    }
    targetLeads = [lead];
  } else {
    // Batch mode (weekly job) — find terminal leads in period
    const periodDays = params.periodDays ?? 30;
    const cutoff = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

    const conditions: any[] = [
      gte(leads.updatedAt, cutoff),
      sql`${leads.status} IN (${sql.join(TERMINAL_STATUSES.map((s) => sql`${s}`), sql`, `)})`,
    ];
    if (params.projectId) {
      conditions.push(eq(leads.projectId, params.projectId));
    }

    // Exclude leads that already have a retrospective
    const existingRetroLeadIds = db
      .select({ leadId: outreachRetrospectives.leadId })
      .from(outreachRetrospectives)
      .where(gte(outreachRetrospectives.createdAt, cutoff))
      .all()
      .map((r) => r.leadId)
      .filter(Boolean) as string[];

    if (existingRetroLeadIds.length > 0) {
      conditions.push(
        sql`${leads.id} NOT IN (${sql.join(existingRetroLeadIds.map((id) => sql`${id}`), sql`, `)})`,
      );
    }

    targetLeads = db
      .select()
      .from(leads)
      .where(and(...conditions))
      .all();
  }

  if (targetLeads.length === 0) {
    return {
      content: JSON.stringify({ ok: true, message: "No terminal leads to analyze", count: 0 }),
    };
  }

  const llm = createLlmClient(
    { OPENAI_API_KEY: config.openaiApiKey },
    "openai",
    "gpt-4.1-mini",
  );

  const results: Array<{ leadId: string; outcome: string; analysis: string }> = [];

  for (const lead of targetLeads) {
    // Stitch conversation context
    const logEntries = db
      .select()
      .from(outreachLog)
      .where(eq(outreachLog.leadId, lead.id))
      .orderBy(outreachLog.createdAt)
      .all();

    // Find DM events for this handle
    const dmConvos = db
      .select()
      .from(dmConversations)
      .where(sql`${dmConversations.participantUsernames} LIKE ${"%" + lead.handle + "%"}`)
      .all();

    let dmText = "";
    for (const convo of dmConvos) {
      const events = db
        .select()
        .from(dmEvents)
        .where(eq(dmEvents.conversationId, convo.id))
        .orderBy(dmEvents.createdAt)
        .all();
      dmText += events.map((e) => `[${e.createdAt}] ${e.senderUsername}: ${e.text}`).join("\n");
    }

    const channelsUsed = [...new Set(logEntries.map((e) => e.channel))];
    const totalFollowUps = logEntries.filter((e) => e.action === "sent").length;
    const outcome = params.outcome ?? lead.status;
    const daysToClose = lead.updatedAt && lead.createdAt
      ? Math.round(
          ((lead.updatedAt as Date).getTime() - (lead.createdAt as Date).getTime()) /
            (1000 * 60 * 60 * 24),
        )
      : null;

    // Build LLM prompt
    const contextStr = [
      `Lead: @${lead.handle}`,
      `Signal: ${lead.signalType ?? "unknown"}`,
      `Urgency: ${lead.urgency}`,
      `Outcome: ${outcome}`,
      `Channels: ${channelsUsed.join(", ") || "none"}`,
      `Follow-ups: ${totalFollowUps}`,
      daysToClose != null ? `Days to close: ${daysToClose}` : null,
      `Outreach log:\n${logEntries.map((e) => `  [${e.channel}] ${e.action}: ${e.message?.substring(0, 200) ?? "(no message)"}`).join("\n") || "  (none)"}`,
      dmText ? `DM conversation:\n${dmText.substring(0, 2000)}` : null,
      lead.bdNotes ? `BD notes: ${lead.bdNotes}` : null,
      params.notes ? `Human notes: ${params.notes}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    try {
      const raw = await llm.chatCompletion({
        systemPrompt: `You are a BD retrospective analyst. Analyze the outreach journey for a lead and provide actionable insights.
Return JSON: {
  "whatWorked": ["point1", ...],
  "whatDidntWork": ["point1", ...],
  "recommendations": ["rec1", ...],
  "overallAssessment": "one paragraph summary"
}`,
        userMessage: contextStr,
        temperature: 0.3,
        maxTokens: 800,
        jsonMode: true,
      });

      const analysis = raw ?? '{"overallAssessment": "Analysis unavailable"}';

      // Store in outreach_retrospectives
      const retroId = `retro_${lead.id}_${Date.now()}`;
      db.insert(outreachRetrospectives)
        .values({
          id: retroId,
          leadId: lead.id,
          projectId: lead.projectId,
          outcome,
          aiAnalysis: analysis,
          aiModel: "gpt-4.1-mini",
          channelsUsed: JSON.stringify(channelsUsed),
          totalFollowUps,
          daysToClose,
          notes: params.notes ?? null,
          createdAt: new Date(),
        })
        .run();

      results.push({ leadId: lead.id, outcome, analysis });

      ctx.logger.info(`[retrospective] Analyzed lead ${lead.id} (@${lead.handle}): ${outcome}`);
    } catch (e: any) {
      ctx.logger.error(`[retrospective] Failed for lead ${lead.id}: ${e.message}`);
      results.push({
        leadId: lead.id,
        outcome,
        analysis: JSON.stringify({ error: e.message }),
      });
    }
  }

  // Emit event for CEO agent
  try {
    await ctx.events.emit(EVENT_NAMES.retrospectiveReady, "", {
      count: results.length,
      leads: results.map((r) => ({ leadId: r.leadId, outcome: r.outcome })),
      periodDays: params.periodDays,
    });
  } catch {
    // Events may not be available in all contexts
  }

  const summary = `Retrospective complete: ${results.length} lead(s) analyzed. ` +
    `Outcomes: ${results.map((r) => `${r.leadId}=${r.outcome}`).join(", ")}`;

  return {
    content: JSON.stringify({ ok: true, count: results.length, results }),
    metadata: { leadsAnalyzed: results.length },
  };
}

/**
 * Tool handler wrapper — adapts the core function for the plugin tool interface.
 */
export async function handleOutreachRetrospectiveTool(
  ctx: PluginContext,
  params: unknown,
  _runCtx: ToolRunContext,
): Promise<ToolResult> {
  const p = params as RetroParams;
  if (!p.leadId && !p.periodDays) {
    return { content: JSON.stringify({ error: "leadId or periodDays required" }) };
  }
  return handleOutreachRetrospective(p, ctx);
}
