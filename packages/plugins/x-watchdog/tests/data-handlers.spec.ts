import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";
import { getDb, closeDb } from "../src/db/index.js";
import { handles, tweets, projects, projectHandles, leads } from "../src/db/schema.js";
import fs from "node:fs";
import path from "node:path";
import type { TestHarness } from "@paperclipai/plugin-sdk/testing";

const TEST_DATA_DIR = path.join(import.meta.dirname, ".test-data");

function resetDbSingleton() {
  // Close existing DB and clear singleton refs so getDb() creates a fresh one
  closeDb();
  // Remove data dir to start fresh
  if (fs.existsSync(TEST_DATA_DIR)) {
    fs.rmSync(TEST_DATA_DIR, { recursive: true });
  }
}

describe("data handlers", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    resetDbSingleton();
    harness = createTestHarness({ manifest });
    // setup initializes DB (pushSchema) and registers handlers
    // Override getDb to use test data dir by calling it first
    getDb(TEST_DATA_DIR);
    closeDb();
    // Now let setup call getDb() — but we need it to use our dir.
    // The trick: getDb uses cwd-based default, but we pre-create with our dir.
    // Actually, let's just initialize with our dir, then setup will reuse the singleton.
    getDb(TEST_DATA_DIR);
    await plugin.definition.setup(harness.ctx);
  });

  afterEach(() => {
    resetDbSingleton();
  });

  it("feeds handler returns empty array when no tweets", async () => {
    const result = await harness.getData<{ data: unknown[]; page: number; limit: number }>("feeds");
    expect(result.data).toEqual([]);
    expect(result.page).toBe(1);
  });

  it("feeds handler returns tweets with scores", async () => {
    const db = getDb();
    // Insert a handle first (FK constraint)
    db.insert(handles)
      .values({
        id: "h1",
        username: "testuser",
        displayName: "Test User",
        category: "dev",
        addedAt: new Date(),
        active: true,
        updatedAt: new Date(),
      })
      .run();

    // Insert a tweet
    db.insert(tweets)
      .values({
        id: "t1",
        handleId: "h1",
        content: "This is a test tweet about AI",
        createdAt: new Date(),
        fetchedAt: new Date(),
        aiScore: 8.5,
        aiSummary: "AI-related tweet",
        aiTags: "ai,tech",
        notified: false,
        updatedAt: new Date(),
      })
      .run();

    const result = await harness.getData<{ data: any[] }>("feeds");
    expect(result.data).toHaveLength(1);
    expect(result.data[0].id).toBe("t1");
    expect(result.data[0].aiScore).toBe(8.5);
    expect(result.data[0].username).toBe("testuser");
    expect(result.data[0].content).toBe("This is a test tweet about AI");
  });

  it("feeds handler filters by minScore", async () => {
    const db = getDb();
    db.insert(handles).values({ id: "h1", username: "user1", active: true, updatedAt: new Date() }).run();
    db.insert(tweets).values({ id: "t1", handleId: "h1", content: "low score", aiScore: 3.0, createdAt: new Date(), fetchedAt: new Date(), updatedAt: new Date() }).run();
    db.insert(tweets).values({ id: "t2", handleId: "h1", content: "high score", aiScore: 9.0, createdAt: new Date(), fetchedAt: new Date(), updatedAt: new Date() }).run();

    const result = await harness.getData<{ data: any[] }>("feeds", { minScore: 7 });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].id).toBe("t2");
  });

  it("leads handler returns empty when no leads", async () => {
    const result = await harness.getData<{ leads: unknown[]; total: number }>("leads");
    expect(result.leads).toEqual([]);
    expect(result.total).toBe(0);
  });

  it("leads handler returns leads with status filter", async () => {
    const db = getDb();
    const now = new Date();
    db.insert(leads).values({ id: "l1", handle: "alice", tweetId: "t1", status: "new", urgency: "warm", createdAt: now, updatedAt: now }).run();
    db.insert(leads).values({ id: "l2", handle: "bob", tweetId: "t2", status: "reviewing", urgency: "hot", createdAt: now, updatedAt: now }).run();
    db.insert(leads).values({ id: "l3", handle: "carol", tweetId: "t3", status: "new", urgency: "cold", createdAt: now, updatedAt: now }).run();

    const result = await harness.getData<{ leads: any[]; total: number }>("leads", { status: "new" });
    expect(result.leads).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.leads.every((l: any) => l.status === "new")).toBe(true);
  });

  it("leads handler returns leads with urgency filter", async () => {
    const db = getDb();
    const now = new Date();
    db.insert(leads).values({ id: "l1", handle: "alice", tweetId: "t1", status: "new", urgency: "hot", createdAt: now, updatedAt: now }).run();
    db.insert(leads).values({ id: "l2", handle: "bob", tweetId: "t2", status: "new", urgency: "warm", createdAt: now, updatedAt: now }).run();

    const result = await harness.getData<{ leads: any[]; total: number }>("leads", { urgency: "hot" });
    expect(result.leads).toHaveLength(1);
    expect(result.leads[0].handle).toBe("alice");
  });

  it("projects handler lists all projects", async () => {
    const db = getDb();
    db.insert(projects).values({ id: "p1", name: "Project Alpha", active: true, updatedAt: new Date() }).run();
    db.insert(projects).values({ id: "p2", name: "Project Beta", active: true, updatedAt: new Date() }).run();

    const result = await harness.getData<{ data: any[] }>("projects");
    expect(result.data).toHaveLength(2);
    expect(result.data.map((p: any) => p.name).sort()).toEqual(["Project Alpha", "Project Beta"]);
    // handleCount should default to 0 when no handles assigned
    expect(result.data[0].handleCount).toBe(0);
  });

  it("projects handler includes handle counts", async () => {
    const db = getDb();
    db.insert(projects).values({ id: "p1", name: "Project Alpha", active: true, updatedAt: new Date() }).run();
    db.insert(handles).values({ id: "h1", username: "user1", active: true, updatedAt: new Date() }).run();
    db.insert(handles).values({ id: "h2", username: "user2", active: true, updatedAt: new Date() }).run();
    db.insert(projectHandles).values({ projectId: "p1", handleId: "h1" }).run();
    db.insert(projectHandles).values({ projectId: "p1", handleId: "h2" }).run();

    const result = await harness.getData<{ data: any[] }>("projects");
    expect(result.data).toHaveLength(1);
    expect(result.data[0].handleCount).toBe(2);
  });

  it("project-detail returns project with handle count", async () => {
    const db = getDb();
    db.insert(projects).values({ id: "p1", name: "Project Alpha", active: true, updatedAt: new Date() }).run();
    db.insert(handles).values({ id: "h1", username: "user1", active: true, updatedAt: new Date() }).run();
    db.insert(projectHandles).values({ projectId: "p1", handleId: "h1" }).run();

    const result = await harness.getData<{ data: any }>("project-detail", { id: "p1" });
    expect(result.data.id).toBe("p1");
    expect(result.data.name).toBe("Project Alpha");
    expect(result.data.handleCount).toBe(1);
  });

  it("project-detail returns error for missing project", async () => {
    const result = await harness.getData<{ error: string }>("project-detail", { id: "nonexistent" });
    expect(result.error).toBe("Project not found");
  });

  it("lead-detail returns lead with outreach log", async () => {
    const db = getDb();
    const now = new Date();
    db.insert(leads).values({ id: "l1", handle: "alice", tweetId: "t1", status: "new", urgency: "warm", createdAt: now, updatedAt: now }).run();

    const result = await harness.getData<{ lead: any; outreachLog: any[] }>("lead-detail", { id: "l1" });
    expect(result.lead.id).toBe("l1");
    expect(result.lead.handle).toBe("alice");
    expect(result.outreachLog).toEqual([]);
  });
});
