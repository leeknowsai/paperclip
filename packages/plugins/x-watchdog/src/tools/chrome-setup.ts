/**
 * Tool: chrome-setup
 * Creates Chrome profiles for each X account in the account map, injecting cookies.
 */

import type { PluginContext, ToolRunContext, ToolResult } from "@paperclipai/plugin-sdk";
import { STATE_KEYS } from "../constants.js";
import type { AccountMap } from "../lib/chrome/profile-manager.js";
import { setupXProfiles } from "../lib/chrome/profile-setup.js";

export async function handleChromeSetup(
  ctx: PluginContext,
  params: unknown,
  _runCtx: ToolRunContext,
): Promise<ToolResult> {
  const { sourceProfile } = (params ?? {}) as { sourceProfile?: string };

  const accountMap = ((await ctx.state.get(STATE_KEYS.chromeAccountMap)) ?? {}) as AccountMap;

  if (Object.keys(accountMap).length === 0) {
    return {
      content: JSON.stringify({
        ok: false,
        error: "No account map configured. Use save-account-map action first.",
      }),
    };
  }

  const logs: string[] = [];
  const result = await setupXProfiles(
    accountMap,
    sourceProfile ?? "Default",
    (msg) => {
      ctx.logger.info(`[chrome-setup] ${msg}`);
      logs.push(msg);
    },
  );

  return {
    content: JSON.stringify({
      ok: result.errors.length === 0,
      profilesCreated: result.profilesCreated,
      accounts: result.accounts,
      errors: result.errors,
      logs,
    }),
  };
}
