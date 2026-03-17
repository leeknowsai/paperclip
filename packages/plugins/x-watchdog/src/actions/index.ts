// Registers all action handlers with the plugin context.

import type { PluginContext } from "@paperclipai/plugin-sdk";
import { STATE_KEYS } from "../constants.js";
import { addHandle, removeHandle } from "./handle-crud.js";
import { updateLead } from "./lead-update.js";
import { createProject, updateProject } from "./project-crud.js";
import { triggerJob } from "./trigger-cron.js";
import { initiateOAuth } from "./oauth-flow.js";

export function registerActionHandlers(ctx: PluginContext) {
  ctx.actions.register("add-handle", addHandle);
  ctx.actions.register("remove-handle", removeHandle);
  ctx.actions.register("update-lead", updateLead);
  ctx.actions.register("create-project", createProject);
  ctx.actions.register("update-project", updateProject);
  ctx.actions.register("trigger-job", (params) => triggerJob(ctx, params));
  ctx.actions.register("initiate-oauth", (params) => initiateOAuth(ctx, params));

  // Save Chrome account map to plugin state
  ctx.actions.register("save-account-map", async (params) => {
    const accountMap = params as Record<string, unknown>;
    await ctx.state.set(STATE_KEYS.chromeAccountMap, accountMap);
    ctx.logger.info("Chrome account map saved", { accounts: Object.keys(accountMap) });
    return { ok: true, accounts: Object.keys(accountMap) };
  });

  // Save plugin config — stores in plugin state since SDK config is read-only
  ctx.actions.register("update-config", async (params) => {
    const p = params as Record<string, unknown>;
    await ctx.state.set(
      { scopeKind: "instance", stateKey: "plugin_settings" },
      p,
    );
    ctx.logger.info("Plugin settings updated via UI", { keys: Object.keys(p) });
    return { ok: true };
  });
}
