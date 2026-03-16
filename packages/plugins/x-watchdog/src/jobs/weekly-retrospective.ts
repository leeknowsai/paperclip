/**
 * Job: weekly-retrospective
 * Runs a batch retrospective for all terminal leads from the past 7 days.
 */

import type { PluginContext } from "@paperclipai/plugin-sdk";
import { handleOutreachRetrospective } from "../tools/outreach-retrospective.js";

export async function handleWeeklyRetrospective(ctx: PluginContext): Promise<void> {
  ctx.logger.info("Running weekly retrospective...");
  const result = await handleOutreachRetrospective({ periodDays: 7 }, ctx);

  try {
    const parsed = JSON.parse(result.content);
    ctx.logger.info(
      `Weekly retrospective complete: ${parsed.count ?? 0} leads analyzed`,
    );
  } catch {
    ctx.logger.info(`Weekly retrospective complete: ${result.content.substring(0, 100)}...`);
  }
}
