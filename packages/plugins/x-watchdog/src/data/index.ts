// Registers all data handlers with the plugin context.

import type { PluginContext } from "@paperclipai/plugin-sdk";
import { STATE_KEYS } from "../constants.js";
import { feedsHandler } from "./feeds.js";
import { leadsHandler, leadDetailHandler } from "./leads.js";
import { handlesHandler } from "./handles.js";
import { projectsHandler, projectDetailHandler } from "./projects.js";
import { analyticsHandler } from "./analytics.js";
import { dmConversationsHandler, dmConversationDetailHandler } from "./dm-conversations.js";
import {
  conversionFunnelHandler,
  conversationTimelineHandler,
  retrospectivesHandler,
  templatePerformanceHandler,
} from "./insights.js";

export function registerDataHandlers(ctx: PluginContext) {
  ctx.data.register("feeds", feedsHandler);
  ctx.data.register("leads", leadsHandler);
  ctx.data.register("lead-detail", leadDetailHandler);
  ctx.data.register("handles", handlesHandler);
  ctx.data.register("projects", projectsHandler);
  ctx.data.register("project-detail", projectDetailHandler);
  ctx.data.register("analytics", analyticsHandler);
  ctx.data.register("dm-conversations", dmConversationsHandler);
  ctx.data.register("dm-conversation-detail", dmConversationDetailHandler);
  ctx.data.register("conversion-funnel", conversionFunnelHandler);
  ctx.data.register("conversation-timeline", conversationTimelineHandler);
  ctx.data.register("retrospectives", retrospectivesHandler);
  ctx.data.register("template-performance", templatePerformanceHandler);

  // Chrome integration settings: account map and last scan state
  ctx.data.register("chrome-settings", async () => {
    const accountMap = (await ctx.state.get(STATE_KEYS.chromeAccountMap)) ?? {};
    const lastScan = (await ctx.state.get(STATE_KEYS.chromeLastScan)) ?? null;
    return { data: { accountMap, lastScan } };
  });

  // Expose plugin config (instance config + UI-saved settings) for settings UI
  ctx.data.register("plugin-config", async () => {
    const instanceConfig = (await ctx.config.get()) ?? {};
    const uiSettings = (await ctx.state.get(
      { scopeKind: "instance", stateKey: "plugin_settings" },
    )) ?? {};
    return { data: { ...instanceConfig, ...(uiSettings as Record<string, unknown>) } };
  });
}
