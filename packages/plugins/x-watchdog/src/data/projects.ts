// Data handler: projects — list projects with handle counts.
// Ported from GET /api/projects in src/worker/api/projects.ts

import { eq, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { projects, projectHandles } from "../db/schema.js";

export async function projectsHandler(_params: Record<string, unknown>) {
  const db = getDb();

  const allProjects = db.select().from(projects).all();

  const counts = db
    .select({
      projectId: projectHandles.projectId,
      total: sql<number>`count(*)`,
    })
    .from(projectHandles)
    .groupBy(projectHandles.projectId)
    .all();

  const countMap = new Map(counts.map((r) => [r.projectId, r.total]));

  return {
    data: allProjects.map((p) => ({
      ...p,
      handleCount: countMap.get(p.id) ?? 0,
    })),
  };
}

export async function projectDetailHandler(params: Record<string, unknown>) {
  const db = getDb();
  const id = params.id as string;
  if (!id) throw new Error("id required");

  const project = db.select().from(projects).where(eq(projects.id, id)).get();
  if (!project) return { error: "Project not found" };

  const handleRows = db
    .select({
      handleId: projectHandles.handleId,
    })
    .from(projectHandles)
    .where(eq(projectHandles.projectId, id))
    .all();

  return {
    data: {
      ...project,
      handleCount: handleRows.length,
    },
  };
}
