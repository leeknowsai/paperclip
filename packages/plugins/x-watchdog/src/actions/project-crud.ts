// Action handlers: create-project, update-project.
// Ported from POST/PUT /api/projects in src/worker/api/projects.ts

import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { projects } from "../db/schema.js";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function createProject(params: Record<string, unknown>) {
  const db = getDb();
  const name = params.name as string;
  if (!name) throw new Error("name required");

  const id = (params.id as string) ?? slugify(name);

  const existing = db.select().from(projects).where(eq(projects.id, id)).get();
  if (existing) throw new Error("Project already exists");

  db.insert(projects)
    .values({
      id,
      name,
      tgTopicId: (params.tgTopicId as number) ?? null,
      syncIntervalHours: (params.syncIntervalHours as number) ?? 24,
      active: true,
      updatedAt: new Date(),
    })
    .run();

  return { ok: true, data: { id, name } };
}

export async function updateProject(params: Record<string, unknown>) {
  const db = getDb();
  const id = params.id as string;
  if (!id) throw new Error("id required");

  const updates: Record<string, unknown> = { updatedAt: new Date() };

  const fields: Array<keyof typeof updates> = [
    "name",
    "tgTopicId",
    "syncIntervalHours",
    "active",
    "scoringPrompt",
    "triggerKeywords",
    "bdPriorityThreshold",
    "speedTier",
    "outreachChannels",
    "outreachTemplates",
    "projectDocs",
    "tgGroupId",
    "tgGroupInviteLink",
    "discordForumPostId",
  ];

  for (const field of fields) {
    if (params[field] !== undefined) {
      updates[field] = params[field];
    }
  }

  if (Object.keys(updates).length === 1) {
    throw new Error("Nothing to update");
  }

  db.update(projects).set(updates).where(eq(projects.id, id)).run();

  return { ok: true };
}
