/**
 * Chrome cookie extractor for x.com — reads auth_token + ct0 from Chrome's encrypted SQLite DB.
 * Ported from x-watchdog/scripts/x-cookie-extractor.ts (Bun → Node.js with better-sqlite3).
 */

import { execSync } from "node:child_process";
import { copyFileSync, existsSync, unlinkSync } from "node:fs";
import { pbkdf2Sync, createDecipheriv } from "node:crypto";
import { homedir } from "node:os";
import Database from "better-sqlite3";

export function getKeychainPassword(): string {
  const out = execSync(
    'security find-generic-password -w -a Chrome -s "Chrome Safe Storage"',
    { encoding: "utf8" },
  );
  return out.trim();
}

export function deriveKey(password: string): Buffer {
  return pbkdf2Sync(password, "saltysalt", 1003, 16, "sha1");
}

export function decryptCookie(encryptedValue: Buffer, key: Buffer): string {
  if (encryptedValue.length < 4) throw new Error("Encrypted value too short");
  const prefix = encryptedValue.slice(0, 3).toString("utf8");
  if (prefix !== "v10")
    throw new Error(`Unexpected encryption prefix: ${prefix}`);
  const data = encryptedValue.slice(3);
  const iv = Buffer.alloc(16, 0x20);
  const decipher = createDecipheriv("aes-128-cbc", key, iv);
  let decrypted = decipher.update(data);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  const raw = decrypted.toString("utf8");
  const cleaned = raw.replace(/[^\x20-\x7E]/g, "");
  if (!cleaned.length)
    throw new Error("Decrypted cookie is empty after sanitization");
  const hexMatch = cleaned.match(/[a-f0-9]{32,}/);
  return hexMatch ? hexMatch[0] : cleaned;
}

export interface XCookies {
  auth_token: string;
  ct0: string;
}

export function extractCookies(chromeProfile: string): XCookies {
  const home = homedir();
  const src = `${home}/Library/Application Support/Google/Chrome/${chromeProfile}/Cookies`;

  if (!existsSync(src)) {
    throw new Error(
      `Chrome profile not found: ${chromeProfile} (path: ${src})`,
    );
  }

  const tmp = `/tmp/chrome-cookies-${chromeProfile.replace(/\s/g, "_")}.db`;
  copyFileSync(src, tmp);

  try {
    const password = getKeychainPassword();
    const key = deriveKey(password);
    const db = new Database(tmp, { readonly: true });

    const rows = db
      .prepare(
        `SELECT name, encrypted_value FROM cookies
         WHERE host_key IN ('.x.com', '.twitter.com', 'x.com')
         AND name IN ('auth_token', 'ct0')`,
      )
      .all() as { name: string; encrypted_value: Buffer }[];

    db.close();

    const cookies: Partial<XCookies> = {};
    for (const row of rows) {
      cookies[row.name as keyof XCookies] = decryptCookie(
        Buffer.from(row.encrypted_value),
        key,
      );
    }

    if (!cookies.auth_token)
      throw new Error("auth_token cookie not found — login to x.com in Chrome");
    if (!cookies.ct0)
      throw new Error("ct0 cookie not found — login to x.com in Chrome");

    return cookies as XCookies;
  } finally {
    if (existsSync(tmp)) unlinkSync(tmp);
  }
}
