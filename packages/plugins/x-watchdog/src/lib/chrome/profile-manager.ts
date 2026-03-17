/**
 * Chrome management: spawn with CDP, profile copy, window tiling, login check.
 * Adapted from x-search/src/lib/chrome.ts — removed API fetching, accepts projectKeywords as param.
 */

import { execSync, spawn as cpSpawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface ChromeConfig {
  chromeBin: string;
  cdpPort: number;
}

export interface AccountConfig {
  chromeProfile: string;
  xUsername: string;
}

export type AccountMap = Record<string, AccountConfig>;

export interface ProjectKeywords {
  projectId: string;
  chromeProfile: string;
  xUsername: string;
  keywords: string[];
}

const CHROME_DIR = `${homedir()}/Library/Application Support/Google/Chrome`;
const CDP_DATA_DIR = "/tmp/chrome-cdp-data";
const INTER_PROFILE_DELAY = 3000;
const INTER_KEYWORD_DELAY = 2000;

// ---------- Profile name lookup ----------

export function buildProfileNames(
  accountMap: AccountMap,
): Record<string, string> {
  const names: Record<string, string> = {};
  for (const [, cfg] of Object.entries(accountMap)) {
    names[cfg.chromeProfile] = cfg.xUsername;
  }
  return names;
}

// ---------- Search URL ----------

export function buildSearchUrl(keyword: string): string {
  return `https://x.com/search?q=${encodeURIComponent(keyword)}&src=typed_query&f=live`;
}

// ---------- Secondary display detection ----------

export function getSecondaryScreenBounds(): {
  x: number;
  y: number;
  w: number;
  h: number;
} | null {
  try {
    const out = execSync(
      `osascript -e '
      use framework "AppKit"
      set screens to current application\\'s NSScreen\\'s screens()
      if (count of screens) < 2 then return "none"
      set s to item 2 of screens
      set f to s\\'s frame()
      set x to (item 1 of item 1 of f) as integer
      set y to (item 2 of item 1 of f) as integer
      set w to (item 1 of item 2 of f) as integer
      set h to (item 2 of item 2 of f) as integer
      return (x as text) & "," & (y as text) & "," & (w as text) & "," & (h as text)
    '`,
      { encoding: "utf8" },
    ).trim();
    if (out === "none" || !out) return null;
    const [x, y, w, h] = out.split(",").map(Number);
    return { x, y, w, h };
  } catch {
    return null;
  }
}

// ---------- Tile Chrome windows ----------

export function tileWindowsOnSecondary(
  profiles: string[],
  screen: { x: number; y: number; w: number; h: number },
  profileNames: Record<string, string>,
): void {
  const topCount = Math.min(3, profiles.length);
  const botCount = profiles.length - topCount;
  const halfH = Math.round(screen.h / 2);
  const topW = Math.round(screen.w / topCount);
  const botW = botCount > 0 ? Math.round(screen.w / botCount) : 0;

  const slots = profiles.map((_, i) => {
    if (i < topCount) {
      return {
        x: screen.x + i * topW,
        y: 0,
        x2: screen.x + (i + 1) * topW,
        y2: halfH,
      };
    }
    const bi = i - topCount;
    return {
      x: screen.x + bi * botW,
      y: halfH,
      x2: screen.x + (bi + 1) * botW,
      y2: screen.h,
    };
  });

  const clauses = profiles
    .map((p, i) => {
      const name = profileNames[p] ?? p;
      const s = slots[i];
      return `if title of w contains "${name}" then
              set bounds of w to {${s.x}, ${s.y}, ${s.x2}, ${s.y2}}
            end if`;
    })
    .join("\n            ");

  try {
    execSync(
      `osascript -e '
      tell application "Google Chrome"
        repeat with w in windows
          ${clauses}
        end repeat
      end tell
    '`,
    );
  } catch {
    // Non-fatal — tiling is best-effort
  }
}

// ---------- Open URL in Chrome profile ----------

export function openInProfile(
  config: ChromeConfig,
  profileDir: string,
  url: string,
): void {
  const child = cpSpawn(
    config.chromeBin,
    [
      `--user-data-dir=${CDP_DATA_DIR}`,
      `--profile-directory=${profileDir}`,
      `--remote-debugging-port=${config.cdpPort}`,
      "--no-first-run",
      "--no-default-browser-check",
      url,
    ],
    { stdio: "ignore", detached: true },
  );
  child.unref();
}

// ---------- Copy profiles to CDP data dir ----------

export function copyProfilesToCDPDir(
  profiles: string[],
  profileNames: Record<string, string>,
  log: (msg: string) => void,
): void {
  mkdirSync(CDP_DATA_DIR, { recursive: true });
  const localState = `${CHROME_DIR}/Local State`;
  if (existsSync(localState)) {
    cpSync(localState, `${CDP_DATA_DIR}/Local State`, { force: true });
  }
  for (const profile of profiles) {
    const src = `${CHROME_DIR}/${profile}`;
    const dst = `${CDP_DATA_DIR}/${profile}`;
    if (!existsSync(src)) {
      log(`WARNING: Profile ${profile} not found at ${src}`);
      continue;
    }
    log(`Copying ${profileNames[profile] ?? profile} profile...`);
    cpSync(src, dst, { recursive: true, force: true });
  }
}

// ---------- CDP availability ----------

export async function isCDPAvailable(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://localhost:${port}/json/version`);
    return res.ok;
  } catch {
    return false;
  }
}

export async function waitForCDP(
  port: number,
  timeoutMs = 15000,
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isCDPAvailable(port)) return true;
    await sleep(500);
  }
  return false;
}

// ---------- Ensure Chrome with CDP ----------

export async function ensureChromeWithCDP(
  port: number,
  log: (msg: string) => void,
): Promise<"reused" | "restarted" | "started"> {
  if (await isCDPAvailable(port)) {
    log("Chrome already running with CDP — reusing.");
    return "reused";
  }

  const check = spawnSync("pgrep", ["-x", "Google Chrome"]);
  if (check.status !== 0) return "started";

  log("Chrome running without CDP — restarting with CDP flag...");
  try {
    execSync('osascript -e \'tell application "Google Chrome" to quit\'');
  } catch {
    // ignore
  }
  for (let i = 0; i < 15; i++) {
    await sleep(1000);
    const still = spawnSync("pgrep", ["-x", "Google Chrome"]);
    if (still.status !== 0) return "restarted";
  }
  spawnSync("pkill", ["-9", "-x", "Google Chrome"]);
  await sleep(2000);
  return "restarted";
}

// ---------- Main search-x-open orchestrator ----------

export interface SearchOpenResult {
  tabsOpened: number;
  profiles: string[];
  keywords: string[];
  errors: string[];
}

export async function searchXOpen(
  config: ChromeConfig,
  accountMap: AccountMap,
  projectKeywords: ProjectKeywords[],
  log: (msg: string) => void = console.log,
): Promise<SearchOpenResult> {
  const profileNames = buildProfileNames(accountMap);
  const errors: string[] = [];

  if (projectKeywords.length === 0) {
    return {
      tabsOpened: 0,
      profiles: [],
      keywords: [],
      errors: [
        "No projects with keywords + Chrome profiles found.",
      ],
    };
  }

  log(
    `Found ${projectKeywords.length} project(s): ${projectKeywords.map((pk) => `${pk.projectId} (${pk.keywords.length} kw)`).join(", ")}`,
  );

  const profilesToUse = [
    ...new Set(projectKeywords.map((pk) => pk.chromeProfile)),
  ];

  // Detect secondary display
  const secondScreen = getSecondaryScreenBounds();
  if (secondScreen) {
    log(
      `Secondary display detected (${secondScreen.w}x${secondScreen.h}).`,
    );
  }

  // Ensure Chrome has CDP
  const cdpStatus = await ensureChromeWithCDP(config.cdpPort, log);
  const activeProfileDirs = new Set<string>();

  if (cdpStatus === "reused") {
    try {
      const res = await fetch(`http://localhost:${config.cdpPort}/json`);
      const tabs = (await res.json()) as { url: string }[];
      const xTabs = tabs.filter((t) => t.url?.includes("x.com"));
      if (xTabs.length > 0) {
        for (const profile of profilesToUse) activeProfileDirs.add(profile);
        log(`Found ${xTabs.length} active X tabs — reusing open profiles.`);
      }
    } catch {
      // ignore
    }
  }

  // Copy profiles that aren't already active
  const profilesToCopy = profilesToUse.filter(
    (p) => !activeProfileDirs.has(p),
  );
  if (profilesToCopy.length > 0) {
    log(`Copying ${profilesToCopy.length} profiles for CDP access...`);
    copyProfilesToCDPDir(profilesToCopy, profileNames, log);
  }

  // Open profiles that aren't already active
  const profilesToOpen = profilesToUse.filter(
    (p) => !activeProfileDirs.has(p),
  );
  const loggedInProfiles = new Set<string>([
    ...profilesToUse.filter((p) => activeProfileDirs.has(p)),
  ]);

  for (let pi = 0; pi < profilesToOpen.length; pi++) {
    const profile = profilesToOpen[pi];
    openInProfile(config, profile, "https://x.com/home");

    if (pi === 0 && activeProfileDirs.size === 0) {
      const cdpOk = await waitForCDP(config.cdpPort);
      if (!cdpOk) errors.push("CDP not responding after Chrome launch");
    }

    await sleep(2000);
    loggedInProfiles.add(profile);
  }

  if (loggedInProfiles.size === 0) {
    return {
      tabsOpened: 0,
      profiles: [],
      keywords: [],
      errors: ["No profiles available."],
    };
  }

  // Open search tabs per project
  let totalTabs = 0;
  const allKeywords: string[] = [];

  for (const pk of projectKeywords) {
    if (!loggedInProfiles.has(pk.chromeProfile)) continue;

    log(
      `${pk.projectId} (@${pk.xUsername}): opening ${pk.keywords.length} search tabs`,
    );

    for (let ki = 0; ki < pk.keywords.length; ki++) {
      const keyword = pk.keywords[ki];
      const searchUrl = buildSearchUrl(keyword);
      openInProfile(config, pk.chromeProfile, searchUrl);
      allKeywords.push(keyword);
      totalTabs++;

      if (ki < pk.keywords.length - 1) await sleep(INTER_KEYWORD_DELAY);
    }

    await sleep(INTER_PROFILE_DELAY);
  }

  // Tile windows on secondary display
  if (secondScreen) {
    await sleep(2000);
    tileWindowsOnSecondary(
      [...loggedInProfiles],
      secondScreen,
      profileNames,
    );
    log("Windows tiled on secondary display.");
  }

  log(`Done! Opened ${totalTabs} search tabs across ${loggedInProfiles.size} profiles.`);

  return {
    tabsOpened: totalTabs,
    profiles: [...loggedInProfiles],
    keywords: allKeywords,
    errors,
  };
}
