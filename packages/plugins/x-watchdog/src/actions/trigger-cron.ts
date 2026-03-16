// Action handler: trigger-job — manually invoke a job by key.

import type { PluginContext } from "@paperclipai/plugin-sdk";
import { JOB_KEYS } from "../constants.js";

export async function triggerJob(
  ctx: PluginContext,
  params: Record<string, unknown>
): Promise<{ ok: boolean; jobKey: string; message: string }> {
  const jobKey = params.jobKey as string;
  if (!jobKey) throw new Error("jobKey required");

  const validKeys = Object.values(JOB_KEYS);
  if (!validKeys.includes(jobKey as any)) {
    throw new Error(`Unknown jobKey. Must be one of: ${validKeys.join(", ")}`);
  }

  ctx.logger.info(`[trigger-job] Manual trigger requested for job: ${jobKey}`);

  // Dispatch via ctx.jobs.trigger if available, otherwise log and return
  if (typeof (ctx.jobs as any).trigger === "function") {
    await (ctx.jobs as any).trigger(jobKey);
    return { ok: true, jobKey, message: `Job '${jobKey}' triggered` };
  }

  // Fallback: inline execution for hourly-fetch (most common manual trigger)
  if (jobKey === JOB_KEYS.hourlyFetch) {
    const { handleHourlyFetch } = await import("../jobs/hourly-fetch.js");
    const companyId = typeof params.companyId === "string" ? params.companyId : "";
    await handleHourlyFetch(ctx, companyId);
    return { ok: true, jobKey, message: `Job '${jobKey}' executed inline` };
  }

  ctx.logger.warn(`[trigger-job] No inline executor for '${jobKey}', logged only`);
  return { ok: true, jobKey, message: `Job '${jobKey}' logged (no inline executor)` };
}
