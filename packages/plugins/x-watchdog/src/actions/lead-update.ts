// Action handler: update-lead (status, notes, drafted messages).
// Ported from PUT /api/leads/:id/status, /notes, /drafts in src/worker/api/leads.ts

import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { leads } from "../db/schema.js";

export async function updateLead(params: Record<string, unknown>) {
  const db = getDb();
  const id = params.id as string;
  if (!id) throw new Error("id required");

  const lead = db.select().from(leads).where(eq(leads.id, id)).get();
  if (!lead) throw new Error("Lead not found");

  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (params.status !== undefined) {
    const validStatuses = ["new", "reviewing", "sent", "skipped", "snoozed"];
    if (!validStatuses.includes(params.status as string)) {
      throw new Error(`Invalid status. Must be one of: ${validStatuses.join(", ")}`);
    }
    updates.status = params.status;
  }

  if (params.notes !== undefined) {
    updates.bdNotes = params.notes;
  }

  if (params.draftedMessages !== undefined) {
    updates.draftedMessages =
      typeof params.draftedMessages === "string"
        ? params.draftedMessages
        : JSON.stringify(params.draftedMessages);
  }

  if (params.urgency !== undefined) {
    const validUrgencies = ["hot", "warm", "cold"];
    if (!validUrgencies.includes(params.urgency as string)) {
      throw new Error(`Invalid urgency. Must be one of: ${validUrgencies.join(", ")}`);
    }
    updates.urgency = params.urgency;
  }

  if (params.detectedTgHandle !== undefined) {
    updates.detectedTgHandle = params.detectedTgHandle;
  }

  db.update(leads).set(updates).where(eq(leads.id, id)).run();

  return { ok: true };
}
