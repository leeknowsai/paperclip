import {
  definePlugin,
  runWorker,
  type PluginContext,
  type PluginHealthDiagnostics,
  type PluginWebhookInput,
} from "@paperclipai/plugin-sdk";
import { getDb, pushSchema, closeDb } from "./db/index.js";
import { JOB_KEYS } from "./constants.js";
import { handleHourlyFetch } from "./jobs/hourly-fetch.js";
import { handleDmSync } from "./jobs/dm-sync.js";
import { handleProcessOutreach } from "./jobs/process-outreach.js";
import { handleFollowUpCheck } from "./jobs/follow-up-check.js";
import { handleDailyCleanup } from "./jobs/daily-cleanup.js";
import { registerDataHandlers } from "./data/index.js";
import { registerActionHandlers } from "./actions/index.js";
import { registerToolHandlers } from "./tools/index.js";
import { handleOAuthCallback } from "./actions/oauth-flow.js";

// Captured during setup(), used by onWebhook (which has no ctx parameter)
let _ctx: PluginContext | null = null;

export type XWatchdogConfig = {
  xBearerTokenRef?: string;
  openaiApiKeyRef?: string;
  twitterApiIoKeyRef?: string;
  xOAuthClientId?: string;
  xOAuthClientSecretRef?: string;
  notificationThreshold?: number;
  discordNotify?: boolean;
  maxFollowUps?: number;
  followUpWaitHours?: number;
  tgSyncEnabled?: boolean;
  discordChannels?: {
    bdPipeline?: string;
    approvals?: string;
    errors?: string;
  };
};

const plugin = definePlugin({
  async setup(ctx: PluginContext) {
    _ctx = ctx;
    ctx.logger.info("X Watchdog plugin starting...");

    const db = getDb();
    pushSchema(db);
    ctx.logger.info("Database initialized");

    // Register data handlers (read queries for UI)
    registerDataHandlers(ctx);
    ctx.logger.info("Data handlers registered");

    // Register action handlers (write operations from UI/agents)
    registerActionHandlers(ctx);
    ctx.logger.info("Action handlers registered");

    // Register tool handlers (for agents)
    registerToolHandlers(ctx);
    ctx.logger.info("Tool handlers registered");

    // Hourly fetch: scrape tweets, score, detect leads
    ctx.jobs.register(JOB_KEYS.hourlyFetch, async () => {
      ctx.logger.info("[job] hourly-fetch starting");
      await handleHourlyFetch(ctx);
      ctx.logger.info("[job] hourly-fetch complete");
    });

    ctx.jobs.register(JOB_KEYS.dmSync, async () => {
      ctx.logger.info("[job] dm-sync starting");
      await handleDmSync(ctx);
      ctx.logger.info("[job] dm-sync complete");
    });

    ctx.jobs.register(JOB_KEYS.processOutreach, async () => {
      ctx.logger.info("[job] process-outreach starting");
      await handleProcessOutreach(ctx);
      ctx.logger.info("[job] process-outreach complete");
    });

    ctx.jobs.register(JOB_KEYS.followUpCheck, async () => {
      ctx.logger.info("[job] follow-up-check starting");
      await handleFollowUpCheck(ctx);
      ctx.logger.info("[job] follow-up-check complete");
    });

    ctx.jobs.register(JOB_KEYS.tgGroupSync, async () => {
      ctx.logger.info("tg-group-sync: not yet implemented");
    });

    ctx.jobs.register(JOB_KEYS.weeklyRetrospective, async () => {
      ctx.logger.info("weekly-retrospective: not yet implemented");
    });

    ctx.jobs.register(JOB_KEYS.dailyCleanup, async () => {
      ctx.logger.info("[job] daily-cleanup starting");
      await handleDailyCleanup(ctx);
      ctx.logger.info("[job] daily-cleanup complete");
    });

    ctx.logger.info("X Watchdog plugin ready");
  },

  async onShutdown() {
    closeDb();
  },

  async onHealth(): Promise<PluginHealthDiagnostics> {
    return { status: "ok" };
  },

  async onWebhook(input: PluginWebhookInput): Promise<void> {
    if (input.endpointKey === "oauth-callback") {
      if (!_ctx) {
        console.error("[onWebhook] ctx not yet initialized — ignoring oauth-callback");
        return;
      }
      await handleOAuthCallback(_ctx, input);
    }
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
