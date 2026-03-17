/**
 * Tool: chrome-open
 * Opens X search tabs in Chrome profiles based on project keywords and account map.
 */

import type { PluginContext, ToolRunContext, ToolResult } from "@paperclipai/plugin-sdk";
import { getDb } from "../db/index.js";
import { projects } from "../db/schema.js";
import { STATE_KEYS } from "../constants.js";
import type { AccountMap, ProjectKeywords } from "../lib/chrome/profile-manager.js";
import { searchXOpen } from "../lib/chrome/profile-manager.js";

export async function handleChromeOpen(
  ctx: PluginContext,
  params: unknown,
  _runCtx: ToolRunContext,
): Promise<ToolResult> {
  const raw = (await ctx.config.get()) as Record<string, unknown> | null;
  const chromeBin = (raw?.chromeBin as string | undefined) ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const cdpPort = (raw?.cdpPort as number | undefined) ?? 9222;

  const accountMap = ((await ctx.state.get(STATE_KEYS.chromeAccountMap)) ?? {}) as AccountMap;

  if (Object.keys(accountMap).length === 0) {
    return {
      content: JSON.stringify({
        ok: false,
        error: "No account map configured. Use save-account-map action first.",
      }),
    };
  }

  const db = getDb();
  const allProjects = await db.select().from(projects).all();

  const projectKeywords: ProjectKeywords[] = [];
  for (const project of allProjects) {
    if (!project.active) continue;
    if (!project.triggerKeywords) continue;

    let keywords: string[] = [];
    try {
      keywords = JSON.parse(project.triggerKeywords) as string[];
    } catch {
      continue;
    }
    if (keywords.length === 0) continue;

    // Find a matching account entry for this project
    const accountEntry = accountMap[project.id] ?? Object.values(accountMap)[0];
    if (!accountEntry) continue;

    projectKeywords.push({
      projectId: project.id,
      chromeProfile: accountEntry.chromeProfile,
      xUsername: accountEntry.xUsername,
      keywords,
    });
  }

  const logs: string[] = [];
  const result = await searchXOpen(
    { chromeBin, cdpPort },
    accountMap,
    projectKeywords,
    (msg) => {
      ctx.logger.info(`[chrome-open] ${msg}`);
      logs.push(msg);
    },
  );

  return {
    content: JSON.stringify({
      ok: true,
      tabsOpened: result.tabsOpened,
      profiles: result.profiles,
      keywords: result.keywords,
      errors: result.errors,
      logs,
    }),
  };
}
