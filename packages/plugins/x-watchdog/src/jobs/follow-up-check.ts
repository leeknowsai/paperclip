// Follow-up check job: find contacted leads past their follow-up window,
// either mark them cold (max follow-ups exhausted) or emit follow-up-needed event.

import { and, eq, lt, sql } from "drizzle-orm";
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { getDb } from "../db/index.js";
import { leads, outreachLog } from "../db/schema.js";
import { resolveConfig } from "../lib/config.js";
import { EVENT_NAMES } from "../constants.js";

export async function handleFollowUpCheck(ctx: PluginContext): Promise<void> {
  const cfg = await resolveConfig(ctx);
  const maxFollowUps = cfg.maxFollowUps;
  const followUpWaitHours = cfg.followUpWaitHours;

  const db = getDb();
  const cutoff = new Date(Date.now() - followUpWaitHours * 60 * 60 * 1000);

  // Find leads that are 'contacted' and haven't been updated within the wait window
  const contactedLeads = db
    .select()
    .from(leads)
    .where(
      and(
        eq(leads.status, "contacted"),
        lt(leads.updatedAt, cutoff)
      )
    )
    .all();

  ctx.logger.info(
    `[follow-up-check] ${contactedLeads.length} contacted leads past follow-up window (>${followUpWaitHours}h)`
  );

  if (!contactedLeads.length) return;

  let markedCold = 0;
  let followUpNeeded = 0;

  for (const lead of contactedLeads) {
    try {
      // Count existing follow-ups in outreach log for this lead
      const countRow = db
        .select({ count: sql<number>`count(*)` })
        .from(outreachLog)
        .where(
          and(
            eq(outreachLog.leadId, lead.id),
            eq(outreachLog.action, "follow_up")
          )
        )
        .get();

      const followUpCount = (countRow?.count as number) ?? 0;

      if (followUpCount >= maxFollowUps) {
        // Max follow-ups exhausted — mark as cold
        db.update(leads)
          .set({ status: "cold", updatedAt: new Date() })
          .where(eq(leads.id, lead.id))
          .run();

        ctx.logger.info(
          `[follow-up-check] Lead ${lead.id} (@${lead.handle}) marked cold — ${followUpCount}/${maxFollowUps} follow-ups done`
        );

        try {
          await ctx.events.emit(EVENT_NAMES.leadConverted, "", {
            leadId: lead.id,
            handle: lead.handle,
            projectId: lead.projectId,
            outcome: "cold",
            followUpCount,
          });
        } catch (emitErr) {
          ctx.logger.error(`[follow-up-check] leadConverted emit failed: ${emitErr}`);
        }

        markedCold++;
      } else {
        // Still within follow-up budget — request a follow-up
        ctx.logger.info(
          `[follow-up-check] Lead ${lead.id} (@${lead.handle}) needs follow-up ${followUpCount + 1}/${maxFollowUps}`
        );

        try {
          await ctx.events.emit(EVENT_NAMES.followUpNeeded, "", {
            leadId: lead.id,
            handle: lead.handle,
            projectId: lead.projectId,
            followUpCount,
            maxFollowUps,
            draftedMessages: lead.draftedMessages ? JSON.parse(lead.draftedMessages) : null,
          });
        } catch (emitErr) {
          ctx.logger.error(`[follow-up-check] followUpNeeded emit failed: ${emitErr}`);
        }

        followUpNeeded++;
      }
    } catch (err) {
      ctx.logger.error(`[follow-up-check] Error processing lead ${lead.id}: ${err}`);
    }
  }

  ctx.logger.info(
    `[follow-up-check] Done: ${markedCold} marked cold, ${followUpNeeded} follow-ups requested`
  );
}
