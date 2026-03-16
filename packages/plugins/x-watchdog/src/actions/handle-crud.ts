// Action handlers: add-handle, remove-handle.
// Ported from POST/DELETE /api/handles in src/worker/api/handles.ts

import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { handles, projectHandles } from "../db/schema.js";

export async function addHandle(params: Record<string, unknown>) {
  const db = getDb();
  const username = (params.username as string)?.trim().replace("@", "");
  const category = params.category as string | undefined;
  const projectId = params.projectId as string | undefined;

  if (!username) throw new Error("username required");

  // Check if handle already exists by username
  const existing = db
    .select()
    .from(handles)
    .where(eq(handles.username, username))
    .get();

  let handleId: string;

  if (existing) {
    handleId = existing.id;
    // Reactivate if soft-deleted
    if (!existing.active) {
      db.update(handles)
        .set({ active: true, category: category ?? existing.category, updatedAt: new Date() })
        .where(eq(handles.id, handleId))
        .run();
    }
  } else {
    // Use username-based ID since we don't have X API access at action time
    handleId = `x:${username.toLowerCase()}`;
    const countResult = db
      .select({ c: sql<number>`count(*)` })
      .from(handles)
      .get();
    const batchGroup = ((countResult?.c as number) ?? 0) % 10;

    db.insert(handles)
      .values({
        id: handleId,
        username,
        category: category ?? null,
        batchGroup,
        addedAt: new Date(),
        active: true,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: handles.id,
        set: { active: true, category: category ?? null, updatedAt: new Date() },
      })
      .run();
  }

  // Assign to project if provided
  if (projectId) {
    db.insert(projectHandles)
      .values({ projectId, handleId })
      .onConflictDoNothing()
      .run();
  }

  return { ok: true, handleId, username };
}

export async function removeHandle(params: Record<string, unknown>) {
  const db = getDb();
  const id = params.id as string | undefined;
  const projectId = params.projectId as string | undefined;

  if (!id) throw new Error("id required");

  if (projectId) {
    // Remove from project only
    db.delete(projectHandles)
      .where(and(eq(projectHandles.projectId, projectId), eq(projectHandles.handleId, id)))
      .run();
    return { ok: true, removed: "from-project" };
  }

  // Soft-delete globally
  db.update(handles)
    .set({ active: false, updatedAt: new Date() })
    .where(eq(handles.id, id))
    .run();

  return { ok: true, removed: "global" };
}
