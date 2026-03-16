// Daily cleanup job: delete old tweets, enrich handles, sync following lists.
// Merges enrich-handles.ts + sync-following.ts from the CF worker plus tweet cleanup.

import { eq, lt, sql } from "drizzle-orm";
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { getDb } from "../db/index.js";
import { tweets, projects, projectHandles, handles } from "../db/schema.js";
import { resolveConfig } from "../lib/config.js";
import { createXDataRouter } from "../lib/x-data-router.js";
import { enrichHandlesBatch } from "../lib/handle-enrichment.js";
import { chunk } from "../lib/utils.js";

// X API: fetch accounts that a user is following
async function fetchFollowing(
  userId: string,
  bearerToken: string
): Promise<Array<{ id: string; username: string; name: string }>> {
  const res = await fetch(
    `https://api.x.com/2/users/${userId}/following?max_results=100&user.fields=username,name`,
    { headers: { Authorization: `Bearer ${bearerToken}` } }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`X API fetchFollowing ${res.status}: ${err}`);
  }
  const data = (await res.json()) as {
    data?: Array<{ id: string; username: string; name: string }>;
  };
  return data.data ?? [];
}

export async function handleDailyCleanup(ctx: PluginContext): Promise<void> {
  ctx.logger.info("[daily-cleanup] Starting");

  const cfg = await resolveConfig(ctx);
  const db = getDb();

  // Step 1: Delete tweets older than 30 days
  try {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const result = db
      .delete(tweets)
      .where(lt(tweets.createdAt, cutoff))
      .run();
    ctx.logger.info(`[daily-cleanup] Deleted ${result.changes} tweets older than 30 days`);
  } catch (err) {
    ctx.logger.error(`[daily-cleanup] Tweet cleanup failed: ${err}`);
  }

  // Step 2: Enrich handles (fetch bios via TwitterAPI.io / RapidAPI)
  if (cfg.xBearerToken) {
    try {
      const router = createXDataRouter({
        xBearerToken: cfg.xBearerToken,
        twitterApiIoKey: cfg.twitterApiIoKey,
      });

      ctx.logger.info(
        `[daily-cleanup] Enriching handles via: ${router.availableProviders().join(", ")}`
      );

      const result = await enrichHandlesBatch(db as any, router, {
        limit: 50,      // ~50 calls/day — well within free tier (1000/month)
        refreshDays: 7,
      });

      ctx.logger.info(
        `[daily-cleanup] Handle enrichment: ${result.enriched}/${result.total} enriched, ${result.failed} failed`
      );
    } catch (err) {
      ctx.logger.error(`[daily-cleanup] Handle enrichment failed: ${err}`);
    }
  } else {
    ctx.logger.warn("[daily-cleanup] No X bearer token, skipping handle enrichment");
  }

  // Step 3: Sync following lists for active projects
  if (cfg.xBearerToken) {
    try {
      await syncFollowing(ctx, cfg.xBearerToken);
    } catch (err) {
      ctx.logger.error(`[daily-cleanup] Sync following failed: ${err}`);
    }
  }

  ctx.logger.info("[daily-cleanup] Complete");
}

async function syncFollowing(ctx: PluginContext, bearerToken: string): Promise<void> {
  const db = getDb();
  const now = Date.now();

  const activeProjects = db
    .select()
    .from(projects)
    .where(eq(projects.active, true))
    .all();

  ctx.logger.info(`[daily-cleanup] Syncing following for ${activeProjects.length} active project(s)`);

  for (const project of activeProjects) {
    const intervalMs = (project.syncIntervalHours ?? 24) * 60 * 60 * 1000;
    const lastSynced = project.lastSyncedAt ? new Date(project.lastSyncedAt).getTime() : 0;

    if (now - lastSynced < intervalMs) {
      ctx.logger.info(
        `[daily-cleanup] Project ${project.id} synced recently, skipping`
      );
      continue;
    }

    try {
      await syncProjectFollowing(ctx, project.id, bearerToken);

      db.update(projects)
        .set({ lastSyncedAt: new Date(), updatedAt: new Date() })
        .where(eq(projects.id, project.id))
        .run();
    } catch (err) {
      ctx.logger.error(`[daily-cleanup] syncProjectFollowing failed for ${project.id}: ${err}`);
    }
  }
}

async function syncProjectFollowing(
  ctx: PluginContext,
  projectId: string,
  bearerToken: string
): Promise<void> {
  const db = getDb();

  const projectHandleRows = db
    .select({ handleId: projectHandles.handleId })
    .from(projectHandles)
    .where(eq(projectHandles.projectId, projectId))
    .all();

  if (!projectHandleRows.length) return;

  const countResult = db
    .select({ c: sql<number>`count(*)` })
    .from(handles)
    .get();
  let handleCount = (countResult?.c as number) ?? 0;

  for (const row of projectHandleRows) {
    try {
      const following = await fetchFollowing(row.handleId, bearerToken);

      for (const batch of chunk(following, 10)) {
        db.insert(handles)
          .values(
            batch.map((user) => ({
              id: user.id,
              username: user.username,
              displayName: user.name,
              category: null,
              batchGroup: handleCount++ % 10,
              addedAt: new Date(),
              active: true,
              updatedAt: new Date(),
            }))
          )
          .onConflictDoNothing()
          .run();

        for (const user of batch) {
          db.insert(projectHandles)
            .values({ projectId, handleId: user.id })
            .onConflictDoNothing()
            .run();
        }
      }

      ctx.logger.info(
        `[daily-cleanup] Synced ${following.length} following for handle ${row.handleId} in project ${projectId}`
      );
    } catch (err) {
      ctx.logger.error(
        `[daily-cleanup] fetchFollowing failed for handle ${row.handleId}: ${err}`
      );
    }
  }
}
