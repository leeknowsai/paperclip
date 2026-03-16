import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";
import { getDb, closeDb } from "../src/db/index.js";
import { leads, projects, handles, projectHandles } from "../src/db/schema.js";
import { eq } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";
import type { TestHarness } from "@paperclipai/plugin-sdk/testing";

const TEST_DATA_DIR = path.join(import.meta.dirname, ".test-data-actions");

function resetDbSingleton() {
  closeDb();
  if (fs.existsSync(TEST_DATA_DIR)) {
    fs.rmSync(TEST_DATA_DIR, { recursive: true });
  }
}

describe("action handlers", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    resetDbSingleton();
    harness = createTestHarness({ manifest });
    getDb(TEST_DATA_DIR);
    await plugin.definition.setup(harness.ctx);
  });

  afterEach(() => {
    resetDbSingleton();
  });

  it("create-project creates a new project", async () => {
    const result = await harness.performAction<{ ok: boolean; data: { id: string; name: string } }>(
      "create-project",
      { name: "Test Project", syncIntervalHours: 12 },
    );
    expect(result.ok).toBe(true);
    expect(result.data.name).toBe("Test Project");
    expect(result.data.id).toBe("test-project");

    // Verify via data handler
    const projectsResult = await harness.getData<{ data: any[] }>("projects");
    expect(projectsResult.data).toHaveLength(1);
    expect(projectsResult.data[0].name).toBe("Test Project");
  });

  it("create-project rejects duplicate id", async () => {
    await harness.performAction("create-project", { name: "First" });
    await expect(
      harness.performAction("create-project", { name: "First" }),
    ).rejects.toThrow("Project already exists");
  });

  it("create-project requires name", async () => {
    await expect(
      harness.performAction("create-project", {}),
    ).rejects.toThrow("name required");
  });

  it("update-project updates fields", async () => {
    await harness.performAction("create-project", { name: "My Project" });

    const result = await harness.performAction<{ ok: boolean }>(
      "update-project",
      { id: "my-project", scoringPrompt: "Score for relevance", bdPriorityThreshold: 7 },
    );
    expect(result.ok).toBe(true);

    const detail = await harness.getData<{ data: any }>("project-detail", { id: "my-project" });
    expect(detail.data.scoringPrompt).toBe("Score for relevance");
    expect(detail.data.bdPriorityThreshold).toBe(7);
  });

  it("add-handle adds a new handle", async () => {
    const result = await harness.performAction<{ ok: boolean; handleId: string; username: string }>(
      "add-handle",
      { username: "@testuser", category: "dev" },
    );
    expect(result.ok).toBe(true);
    expect(result.username).toBe("testuser");
    expect(result.handleId).toBe("x:testuser");

    // Verify in DB
    const db = getDb();
    const row = db.select().from(handles).where(eq(handles.id, "x:testuser")).get();
    expect(row).toBeTruthy();
    expect(row!.username).toBe("testuser");
    expect(row!.category).toBe("dev");
  });

  it("add-handle assigns to project when projectId given", async () => {
    await harness.performAction("create-project", { name: "Alpha" });
    await harness.performAction("add-handle", { username: "alice", projectId: "alpha" });

    const db = getDb();
    const link = db
      .select()
      .from(projectHandles)
      .where(eq(projectHandles.projectId, "alpha"))
      .all();
    expect(link).toHaveLength(1);
    expect(link[0].handleId).toBe("x:alice");
  });

  it("add-handle reactivates soft-deleted handle", async () => {
    const db = getDb();
    // Insert a soft-deleted handle directly
    db.insert(handles)
      .values({ id: "x:bob", username: "bob", active: false, updatedAt: new Date() })
      .run();

    const result = await harness.performAction<{ ok: boolean; handleId: string }>(
      "add-handle",
      { username: "bob" },
    );
    expect(result.ok).toBe(true);

    const row = db.select().from(handles).where(eq(handles.id, "x:bob")).get();
    expect(row!.active).toBe(true);
  });

  it("add-handle requires username", async () => {
    await expect(
      harness.performAction("add-handle", {}),
    ).rejects.toThrow("username required");
  });

  it("remove-handle soft-deletes globally", async () => {
    await harness.performAction("add-handle", { username: "carol" });

    const result = await harness.performAction<{ ok: boolean; removed: string }>(
      "remove-handle",
      { id: "x:carol" },
    );
    expect(result.ok).toBe(true);
    expect(result.removed).toBe("global");

    const db = getDb();
    const row = db.select().from(handles).where(eq(handles.id, "x:carol")).get();
    expect(row!.active).toBe(false);
  });

  it("remove-handle removes from project only", async () => {
    await harness.performAction("create-project", { name: "Alpha" });
    await harness.performAction("add-handle", { username: "dave", projectId: "alpha" });

    const result = await harness.performAction<{ ok: boolean; removed: string }>(
      "remove-handle",
      { id: "x:dave", projectId: "alpha" },
    );
    expect(result.ok).toBe(true);
    expect(result.removed).toBe("from-project");

    // Handle still exists globally
    const db = getDb();
    const row = db.select().from(handles).where(eq(handles.id, "x:dave")).get();
    expect(row!.active).toBe(true);

    // But not linked to project
    const links = db.select().from(projectHandles).where(eq(projectHandles.projectId, "alpha")).all();
    expect(links).toHaveLength(0);
  });

  it("update-lead changes lead status", async () => {
    const db = getDb();
    const now = new Date();
    db.insert(leads)
      .values({ id: "l1", handle: "alice", tweetId: "t1", status: "new", urgency: "warm", createdAt: now, updatedAt: now })
      .run();

    const result = await harness.performAction<{ ok: boolean }>(
      "update-lead",
      { id: "l1", status: "reviewing" },
    );
    expect(result.ok).toBe(true);

    const row = db.select().from(leads).where(eq(leads.id, "l1")).get();
    expect(row!.status).toBe("reviewing");
  });

  it("update-lead rejects invalid status", async () => {
    const db = getDb();
    const now = new Date();
    db.insert(leads)
      .values({ id: "l1", handle: "alice", tweetId: "t1", status: "new", urgency: "warm", createdAt: now, updatedAt: now })
      .run();

    await expect(
      harness.performAction("update-lead", { id: "l1", status: "invalid" }),
    ).rejects.toThrow("Invalid status");
  });

  it("update-lead updates notes and urgency", async () => {
    const db = getDb();
    const now = new Date();
    db.insert(leads)
      .values({ id: "l1", handle: "alice", tweetId: "t1", status: "new", urgency: "warm", createdAt: now, updatedAt: now })
      .run();

    await harness.performAction("update-lead", {
      id: "l1",
      notes: "Very promising lead",
      urgency: "hot",
    });

    const row = db.select().from(leads).where(eq(leads.id, "l1")).get();
    expect(row!.bdNotes).toBe("Very promising lead");
    expect(row!.urgency).toBe("hot");
  });

  it("update-lead throws for nonexistent lead", async () => {
    await expect(
      harness.performAction("update-lead", { id: "nonexistent", status: "new" }),
    ).rejects.toThrow("Lead not found");
  });

  it("trigger-job validates job key", async () => {
    await expect(
      harness.performAction("trigger-job", { jobKey: "invalid-job" }),
    ).rejects.toThrow("Unknown jobKey");
  });

  it("trigger-job accepts valid job key", async () => {
    // hourly-fetch will fail due to missing API keys, but the validation should pass
    // and it should attempt to run. We just verify it doesn't throw "Unknown jobKey".
    const result = await harness.performAction<{ ok: boolean; jobKey: string; message: string }>(
      "trigger-job",
      { jobKey: "hourly-fetch" },
    );
    // trigger-job either triggers via ctx.jobs.trigger or runs inline
    expect(result.ok).toBe(true);
    expect(result.jobKey).toBe("hourly-fetch");
  });

  it("trigger-job requires jobKey", async () => {
    await expect(
      harness.performAction("trigger-job", {}),
    ).rejects.toThrow("jobKey required");
  });
});
