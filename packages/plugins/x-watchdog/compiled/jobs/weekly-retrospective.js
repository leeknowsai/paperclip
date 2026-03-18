/**
 * Job: weekly-retrospective
 * Runs a batch retrospective for all terminal leads from the past 7 days.
 */
import { handleOutreachRetrospective } from "../tools/outreach-retrospective.js";
import { EVENT_NAMES } from "../constants.js";
export async function handleWeeklyRetrospective(ctx, companyId = "") {
    ctx.logger.info("Running weekly retrospective...");
    const result = await handleOutreachRetrospective({ periodDays: 7 }, ctx);
    let parsed = null;
    try {
        parsed = JSON.parse(result.content);
        ctx.logger.info(`Weekly retrospective complete: ${parsed.count ?? 0} leads analyzed`);
    }
    catch {
        ctx.logger.info(`Weekly retrospective complete: ${result.content.substring(0, 100)}...`);
    }
    // Emit ceo-proposal event with retrospective results
    try {
        await ctx.events.emit(EVENT_NAMES.ceoProposal, companyId, {
            type: "weekly-retrospective",
            summary: parsed?.summary ?? result.content.substring(0, 500),
            metrics: parsed?.metrics ?? null,
            recommendations: parsed?.recommendations ?? null,
            periodDays: 7,
            leadsAnalyzed: parsed?.count ?? 0,
        });
    }
    catch (emitErr) {
        ctx.logger.error(`[weekly-retrospective] ceo-proposal event emit failed: ${emitErr}`);
    }
}
//# sourceMappingURL=weekly-retrospective.js.map