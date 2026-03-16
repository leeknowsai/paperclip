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
import { registerDataHandlers } from "./data/index.js";
import { registerActionHandlers } from "./actions/index.js";

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

    // Hourly fetch: scrape tweets, score, detect leads
    ctx.jobs.register(JOB_KEYS.hourlyFetch, async () => {
      ctx.logger.info("[job] hourly-fetch starting");
      await handleHourlyFetch(ctx);
      ctx.logger.info("[job] hourly-fetch complete");
    });

    ctx.jobs.register(JOB_KEYS.dmSync, async () => {
      ctx.logger.info("dm-sync: not yet implemented");
    });

    ctx.jobs.register(JOB_KEYS.processOutreach, async () => {
      ctx.logger.info("process-outreach: not yet implemented");
    });

    ctx.jobs.register(JOB_KEYS.followUpCheck, async () => {
      ctx.logger.info("follow-up-check: not yet implemented");
    });

    ctx.jobs.register(JOB_KEYS.tgGroupSync, async () => {
      ctx.logger.info("tg-group-sync: not yet implemented");
    });

    ctx.jobs.register(JOB_KEYS.weeklyRetrospective, async () => {
      ctx.logger.info("weekly-retrospective: not yet implemented");
    });

    ctx.jobs.register(JOB_KEYS.dailyCleanup, async () => {
      ctx.logger.info("daily-cleanup: not yet implemented");
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
      // OAuth 2.0 PKCE callback — to be implemented in Task 12
      console.info("oauth-callback webhook received (not yet implemented)", {
        requestId: input.requestId,
      });
    }
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
