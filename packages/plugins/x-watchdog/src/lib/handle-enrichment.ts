import { and, eq, isNull, lt, or } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { handles } from "../db/schema.js";
import type { XDataRouter } from "./x-data-router.js";

/** Enrich a single handle with profile data from the best available provider */
export async function enrichHandle(
  db: BetterSQLite3Database,
  router: XDataRouter,
  username: string,
  handleId: string
): Promise<{ enriched: boolean; source: string }> {
  const { profile, source } = await router.lookupUser(username);

  if (!profile) {
    // Mark as attempted so we don't retry endlessly (will retry after refreshDays)
    db.update(handles)
      .set({ enrichedAt: new Date(), enrichmentSource: `${source}:not_found` })
      .where(eq(handles.id, handleId))
      .run();
    return { enriched: false, source };
  }

  db.update(handles)
    .set({
      // Update username if changed (handle renamed on X)
      username: profile.username || username,
      displayName: profile.displayName || null,
      bio: profile.bio || null,
      followersCount: profile.followersCount,
      followingCount: profile.followingCount,
      xTweetCount: profile.tweetCount,
      location: profile.location || null,
      verified: profile.verified,
      profileImageUrl: profile.profileImageUrl || null,
      website: profile.website || null,
      xCreatedAt: profile.createdAt || null,
      enrichedAt: new Date(),
      enrichmentSource: source,
    })
    .where(eq(handles.id, handleId))
    .run();

  return { enriched: true, source };
}

/** Batch enrich handles that haven't been enriched or need refresh */
export async function enrichHandlesBatch(
  db: BetterSQLite3Database,
  router: XDataRouter,
  options: {
    /** Max handles per batch (default: 50 — fits in free tier budget) */
    limit?: number;
    /** Re-enrich handles older than N days (default: 7) */
    refreshDays?: number;
  } = {}
): Promise<{ total: number; enriched: number; failed: number }> {
  const limit = options.limit ?? 50;
  const refreshDays = options.refreshDays ?? 7;
  const cutoff = new Date(Date.now() - refreshDays * 24 * 60 * 60 * 1000);

  // Get handles needing enrichment: never enriched OR stale
  const needsEnrichment = db
    .select({ id: handles.id, username: handles.username, enrichedAt: handles.enrichedAt })
    .from(handles)
    .where(
      and(
        eq(handles.active, true),
        or(isNull(handles.enrichedAt), lt(handles.enrichedAt, cutoff))
      )
    )
    .limit(limit)
    .all();

  let enriched = 0;
  let failed = 0;

  for (const handle of needsEnrichment) {
    try {
      const result = await enrichHandle(db, router, handle.username, handle.id);
      if (result.enriched) {
        enriched++;
        console.log(`[enrich] ${handle.username} via ${result.source}`);
      } else {
        failed++;
        console.warn(`[enrich] ${handle.username} — no data from any provider`);
      }
    } catch (err) {
      failed++;
      console.error(`[enrich] ${handle.username} error:`, err);
    }
  }

  return { total: needsEnrichment.length, enriched, failed };
}
