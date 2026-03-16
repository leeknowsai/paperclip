import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { configs } from "../db/schema.js";

export async function getDbConfig(
  db: BetterSQLite3Database<Record<string, unknown>>,
  key: string
): Promise<string | null> {
  const row = db.select().from(configs).where(eq(configs.key, key)).get();
  return row?.value ?? null;
}

export async function setDbConfig(
  db: BetterSQLite3Database<Record<string, unknown>>,
  key: string,
  value: string
): Promise<void> {
  db.insert(configs)
    .values({ key, value })
    .onConflictDoUpdate({ target: configs.key, set: { value } })
    .run();
}
