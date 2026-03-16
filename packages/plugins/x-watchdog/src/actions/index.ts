// Registers all action handlers with the plugin context.

import type { PluginContext } from "@paperclipai/plugin-sdk";
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
}
