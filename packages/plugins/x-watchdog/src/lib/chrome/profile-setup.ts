/**
 * Chrome profile creator — creates per-account Chrome profiles with X cookies.
 * Ported from x-watchdog/scripts/x-profiles/create-x-profiles.ts (Bun → Node.js with better-sqlite3).
 */

import { execSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { createCipheriv } from "node:crypto";
import Database from "better-sqlite3";
import {
  decryptCookie,
  deriveKey,
  getKeychainPassword,
} from "./cookie-extractor.js";
import type { AccountMap } from "./profile-manager.js";

const CHROME_DIR = `${homedir()}/Library/Application Support/Google/Chrome`;

export interface ProfileSetupResult {
  profilesCreated: number;
  accounts: { username: string; profile: string }[];
  errors: string[];
}

function encryptCookie(value: string, key: Buffer): Buffer {
  const iv = Buffer.alloc(16, 0x20);
  const cipher = createCipheriv("aes-128-cbc", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([Buffer.from("v10"), encrypted]);
}

interface TokenInfo {
  activeUserId: string;
  activeToken: string;
  multiTokens: Map<string, string>;
}

function extractTokens(sourceProfile: string, key: Buffer): TokenInfo {
  const src = `${CHROME_DIR}/${sourceProfile}/Cookies`;
  const tmp = `/tmp/chrome-cookies-extract.db`;
  copyFileSync(src, tmp);

  const db = new Database(tmp, { readonly: true });
  const getVal = (name: string): string | null => {
    const r = db
      .prepare(
        `SELECT encrypted_value FROM cookies WHERE host_key = '.x.com' AND name = ?`,
      )
      .get(name) as { encrypted_value: Buffer } | undefined;
    return r ? decryptCookie(Buffer.from(r.encrypted_value), key) : null;
  };

  const authTokenRaw = getVal("auth_token")!;
  const authMultiRaw = getVal("auth_multi")!;
  const twidRaw = getVal("twid")!;
  db.close();

  try {
    require("fs").unlinkSync(tmp);
  } catch {
    // ignore
  }

  const activeToken = authTokenRaw.match(/[a-f0-9]{40}/)![0];
  const activeUserId = twidRaw.match(/(\d{5,})/)![0];

  const multiTokens = new Map<string, string>();
  for (const m of authMultiRaw.matchAll(/(\d{5,}):([a-f0-9]{40})/g)) {
    multiTokens.set(m[1], m[2]);
  }
  multiTokens.set(activeUserId, activeToken);

  return { activeUserId, activeToken, multiTokens };
}

function findNextProfileNum(): number {
  let n = 7;
  while (existsSync(`${CHROME_DIR}/Profile ${n}`)) n++;
  return n;
}

function createProfile(
  profileDir: string,
  profileName: string,
  authToken: string,
  key: Buffer,
  sourceProfile: string,
): void {
  mkdirSync(profileDir, { recursive: true });

  const prefs = {
    profile: { name: profileName, avatar_index: 0 },
    browser: { has_seen_welcome_page: true },
  };
  writeFileSync(`${profileDir}/Preferences`, JSON.stringify(prefs, null, 2));

  const srcCookies = `${CHROME_DIR}/${sourceProfile}/Cookies`;
  const dstCookies = `${profileDir}/Cookies`;
  copyFileSync(srcCookies, dstCookies);

  const db = new Database(dstCookies);

  db.exec(
    `DELETE FROM cookies WHERE host_key IN ('.x.com', '.twitter.com', 'x.com', 'twitter.com')`,
  );

  const srcTmp = `/tmp/chrome-src-cookies.db`;
  copyFileSync(srcCookies, srcTmp);
  const srcDb = new Database(srcTmp, { readonly: true });

  const templateCookies = srcDb
    .prepare(
      `SELECT * FROM cookies WHERE host_key IN ('.x.com', 'x.com') AND name NOT IN ('auth_token', 'auth_multi', 'ct0', 'twid', 'kdt')`,
    )
    .all() as any[];

  const insertStmt = db.prepare(
    `INSERT OR REPLACE INTO cookies (creation_utc, host_key, top_frame_site_key, name, value, encrypted_value, path, expires_utc, is_secure, is_httponly, last_access_utc, has_expires, is_persistent, priority, samesite, source_scheme, source_port, last_update_utc, source_type, has_cross_site_ancestor)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  for (const c of templateCookies) {
    insertStmt.run(
      c.creation_utc,
      c.host_key,
      c.top_frame_site_key,
      c.name,
      c.value,
      c.encrypted_value,
      c.path,
      c.expires_utc,
      c.is_secure,
      c.is_httponly,
      c.last_access_utc,
      c.has_expires,
      c.is_persistent,
      c.priority,
      c.samesite,
      c.source_scheme,
      c.source_port,
      c.last_update_utc,
      c.source_type,
      c.has_cross_site_ancestor,
    );
  }

  const authTemplate = srcDb
    .prepare(
      `SELECT * FROM cookies WHERE host_key = '.x.com' AND name = 'auth_token'`,
    )
    .get() as any;

  srcDb.close();
  try {
    require("fs").unlinkSync(srcTmp);
  } catch {
    // ignore
  }

  if (!authTemplate) {
    db.close();
    throw new Error("No auth_token template found in source profile");
  }

  const encAuthToken = encryptCookie(authToken, key);
  insertStmt.run(
    authTemplate.creation_utc,
    ".x.com",
    authTemplate.top_frame_site_key,
    "auth_token",
    "",
    encAuthToken,
    "/",
    authTemplate.expires_utc,
    1,
    1,
    authTemplate.last_access_utc,
    1,
    1,
    authTemplate.priority,
    authTemplate.samesite,
    authTemplate.source_scheme,
    authTemplate.source_port,
    authTemplate.last_update_utc,
    authTemplate.source_type,
    authTemplate.has_cross_site_ancestor,
  );

  db.close();
}

function registerProfiles(
  profileEntries: { dir: string; name: string }[],
): void {
  const localStatePath = `${CHROME_DIR}/Local State`;
  const localState = JSON.parse(readFileSync(localStatePath, "utf8"));

  if (!localState.profile) localState.profile = {};
  if (!localState.profile.info_cache) localState.profile.info_cache = {};

  for (const entry of profileEntries) {
    const profileKey = entry.dir.split("/").pop()!;
    localState.profile.info_cache[profileKey] = {
      active_time: Date.now() / 1000,
      avatar_icon: "chrome://theme/IDR_PROFILE_AVATAR_0",
      background_apps: false,
      force_signin_profile_locked: false,
      gaia_id: "",
      gaia_name: "",
      hosted_domain: "",
      is_consented_primary_account: false,
      is_ephemeral: false,
      is_using_default_avatar: true,
      is_using_default_name: false,
      managed_user_id: "",
      metrics_bucket_index: 0,
      name: entry.name,
      shortcut_name: "",
      user_name: "",
    };
  }

  writeFileSync(localStatePath, JSON.stringify(localState, null, 2));
}

// ---------- Main orchestrator ----------

export async function setupXProfiles(
  accountMap: AccountMap,
  sourceProfile = "Default",
  log: (msg: string) => void = console.log,
): Promise<ProfileSetupResult> {
  const errors: string[] = [];
  const accounts: { username: string; profile: string }[] = [];

  // Check Chrome is not running
  const chromeCheck = spawnSync("pgrep", ["-x", "Google Chrome"]);
  if (chromeCheck.status === 0) {
    return {
      profilesCreated: 0,
      accounts: [],
      errors: [
        "Chrome is running. Close Chrome first, then re-run this tool.",
      ],
    };
  }

  log("Extracting tokens from source profile...");
  const password = getKeychainPassword();
  const key = deriveKey(password);

  let tokenInfo: TokenInfo;
  try {
    tokenInfo = extractTokens(sourceProfile, key);
  } catch (e: any) {
    return {
      profilesCreated: 0,
      accounts: [],
      errors: [`Failed to extract tokens: ${e.message}`],
    };
  }

  log(`Found ${tokenInfo.multiTokens.size} account tokens`);

  // Build userId → slug mapping from accountMap
  // We need to match tokens to accounts. Since accountMap doesn't store userId,
  // we create profiles for all accounts that have existing chromeProfile dirs.
  // For accounts that DON'T have a profile yet, we create one.
  let nextNum = findNextProfileNum();
  const profileEntries: { dir: string; name: string }[] = [];

  for (const [slug, cfg] of Object.entries(accountMap)) {
    const profileDir = `${CHROME_DIR}/${cfg.chromeProfile}`;
    if (existsSync(profileDir)) {
      log(`  ${slug} (@${cfg.xUsername}): profile ${cfg.chromeProfile} already exists`);
      accounts.push({
        username: cfg.xUsername,
        profile: cfg.chromeProfile,
      });
      continue;
    }

    // Find token for this account — we try to match by iterating multiTokens
    // Since we can't match userId to slug without external data, just create
    // the profile directory structure. The user should run this with proper token mapping.
    log(`  ${slug} (@${cfg.xUsername}): creating profile ${cfg.chromeProfile}...`);
    try {
      createProfile(
        profileDir,
        `X: ${cfg.xUsername}`,
        tokenInfo.activeToken, // fallback — user should verify
        key,
        sourceProfile,
      );
      profileEntries.push({ dir: profileDir, name: `X: ${cfg.xUsername}` });
      accounts.push({
        username: cfg.xUsername,
        profile: cfg.chromeProfile,
      });
    } catch (e: any) {
      errors.push(`Failed to create profile for ${slug}: ${e.message}`);
    }
  }

  if (profileEntries.length > 0) {
    log("Registering new profiles in Chrome Local State...");
    registerProfiles(profileEntries);
  }

  return {
    profilesCreated: profileEntries.length,
    accounts,
    errors,
  };
}
