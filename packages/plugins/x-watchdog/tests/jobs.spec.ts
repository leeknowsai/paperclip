import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestHarness, type TestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";
import { getDb, closeDb, pushSchema } from "../src/db/index.js";
import { JOB_KEYS } from "../src/constants.js";
import {
  handles,
  tweets,
  projects,
  leads,
  outreachLog,
  analysisJobs,
  configs,
} from "../src/db/schema.js";
import { eq } from "drizzle-orm";

// Unique data dir per test run to avoid collisions
let dataDir: string;
let harness: TestHarness;

function setupHarness() {
  dataDir = `/tmp/x-watchdog-test-jobs-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  // Initialize DB before plugin setup (plugin calls getDb internally)
  const db = getDb(dataDir);
  pushSchema(db);

  harness = createTestHarness({
    manifest,
    config: {
      xBearerTokenRef: "test-bearer-ref",
      openaiApiKeyRef: "test-openai-ref",
      notificationThreshold: 7,
      maxFollowUps: 2,
      followUpWaitHours: 48,
    },
  });
}

// Mock resolveConfig to return test values without requiring real secret resolution
vi.mock("../src/lib/config.js", () => ({
  resolveConfig: vi.fn().mockResolvedValue({
    xBearerToken: "test-bearer-token",
    openaiApiKey: "test-openai-key",
    twitterApiIoKey: undefined,
    notificationThreshold: 7,
    maxFollowUps: 2,
    followUpWaitHours: 48,
  }),
}));

describe("jobs", () => {
  beforeEach(() => {
    setupHarness();
  });

  afterEach(() => {
    closeDb();
    // Clean up temp DB files
    try {
      const fs = require("node:fs");
      fs.rmSync(dataDir, { recursive: true, force: true });
    } catch { /* ignore */ }
  });

  describe("job registration", () => {
    it("registers all job handlers after setup", async () => {
      await plugin.definition.setup(harness.ctx);

      // Verify all jobs are registered by trying to run them
      // (they may fail due to missing external deps, but they should be registered)
      const jobKeys = Object.values(JOB_KEYS);
      for (const key of jobKeys) {
        // runJob throws "No job handler registered" if not registered
        // We just check it doesn't throw that specific error
        try {
          await harness.runJob(key);
        } catch (e: any) {
          // It should NOT be "No job handler registered"
          expect(e.message).not.toContain("No job handler registered");
        }
      }
    });

    it("hourly-fetch job is registered and callable", async () => {
      await plugin.definition.setup(harness.ctx);

      // The hourly-fetch job should be registered
      // It will exit early because there are no handles in the batch
      await harness.runJob(JOB_KEYS.hourlyFetch);

      // Verify it logged something
      const fetchLogs = harness.logs.filter((l) =>
        l.message.includes("hourly-fetch"),
      );
      expect(fetchLogs.length).toBeGreaterThan(0);
    });
  });

  describe("daily-cleanup", () => {
    it("deletes tweets older than 30 days", async () => {
      await plugin.definition.setup(harness.ctx);
      const db = getDb();

      // Insert a handle first (tweets reference handles)
      db.insert(handles)
        .values({
          id: "h1",
          username: "testuser",
          active: true,
          addedAt: new Date(),
          updatedAt: new Date(),
        })
        .run();

      // Insert old tweet (31 days ago)
      const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
      db.insert(tweets)
        .values({
          id: "old_tweet_1",
          handleId: "h1",
          content: "old tweet content",
          createdAt: oldDate,
          fetchedAt: oldDate,
          updatedAt: oldDate,
        })
        .run();

      // Insert recent tweet (1 day ago)
      const recentDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
      db.insert(tweets)
        .values({
          id: "recent_tweet_1",
          handleId: "h1",
          content: "recent tweet content",
          createdAt: recentDate,
          fetchedAt: recentDate,
          updatedAt: recentDate,
        })
        .run();

      // Mock fetch to prevent real API calls during sync-following
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => "Unauthorized",
      });

      try {
        await harness.runJob(JOB_KEYS.dailyCleanup);
      } finally {
        globalThis.fetch = originalFetch;
      }

      // Verify old tweet was deleted
      const oldTweet = db
        .select()
        .from(tweets)
        .where(eq(tweets.id, "old_tweet_1"))
        .get();
      expect(oldTweet).toBeUndefined();

      // Verify recent tweet still exists
      const recentTweet = db
        .select()
        .from(tweets)
        .where(eq(tweets.id, "recent_tweet_1"))
        .get();
      expect(recentTweet).toBeDefined();
      expect(recentTweet!.content).toBe("recent tweet content");
    });
  });

  describe("follow-up-check", () => {
    it("marks contacted leads as cold when max follow-ups exhausted", async () => {
      await plugin.definition.setup(harness.ctx);
      const db = getDb();

      // Insert a project
      db.insert(projects)
        .values({
          id: "proj1",
          name: "Test Project",
          active: true,
          updatedAt: new Date(),
        })
        .run();

      // Insert a lead with status=contacted and old updatedAt (past follow-up window)
      const oldDate = new Date(Date.now() - 72 * 60 * 60 * 1000); // 72 hours ago (> 48h default)
      db.insert(leads)
        .values({
          id: "lead1",
          projectId: "proj1",
          handle: "testlead",
          tweetId: "tweet123",
          status: "contacted",
          urgency: "warm",
          createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          updatedAt: oldDate,
        })
        .run();

      // Insert 2 follow-up entries (matching maxFollowUps=2)
      db.insert(outreachLog)
        .values({
          id: "ol1",
          leadId: "lead1",
          channel: "x_dm",
          action: "follow_up",
          message: "Follow-up 1",
          status: "delivered",
          createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        })
        .run();

      db.insert(outreachLog)
        .values({
          id: "ol2",
          leadId: "lead1",
          channel: "x_dm",
          action: "follow_up",
          message: "Follow-up 2",
          status: "delivered",
          createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        })
        .run();

      await harness.runJob(JOB_KEYS.followUpCheck);

      // Verify lead status changed to cold
      const lead = db
        .select()
        .from(leads)
        .where(eq(leads.id, "lead1"))
        .get();
      expect(lead).toBeDefined();
      expect(lead!.status).toBe("cold");
    });

    it("emits follow-up-needed event when follow-ups remain", async () => {
      await plugin.definition.setup(harness.ctx);
      const db = getDb();

      // Insert a project
      db.insert(projects)
        .values({
          id: "proj2",
          name: "Test Project 2",
          active: true,
          updatedAt: new Date(),
        })
        .run();

      // Insert a lead with status=contacted and old updatedAt
      const oldDate = new Date(Date.now() - 72 * 60 * 60 * 1000);
      db.insert(leads)
        .values({
          id: "lead2",
          projectId: "proj2",
          handle: "anotheruser",
          tweetId: "tweet456",
          status: "contacted",
          urgency: "warm",
          createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          updatedAt: oldDate,
        })
        .run();

      // Insert only 1 follow-up (below maxFollowUps=2)
      db.insert(outreachLog)
        .values({
          id: "ol3",
          leadId: "lead2",
          channel: "x_dm",
          action: "follow_up",
          message: "Follow-up 1",
          status: "delivered",
          createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        })
        .run();

      await harness.runJob(JOB_KEYS.followUpCheck);

      // Lead should NOT be marked cold (still has follow-up budget)
      const lead = db
        .select()
        .from(leads)
        .where(eq(leads.id, "lead2"))
        .get();
      expect(lead).toBeDefined();
      expect(lead!.status).toBe("contacted"); // unchanged

      // Verify follow-up-needed log was emitted
      const followUpLogs = harness.logs.filter(
        (l) => l.message.includes("needs follow-up"),
      );
      expect(followUpLogs.length).toBe(1);
    });

    it("does nothing when no contacted leads past window", async () => {
      await plugin.definition.setup(harness.ctx);
      const db = getDb();

      // Insert a recently contacted lead (within follow-up window)
      db.insert(projects)
        .values({
          id: "proj3",
          name: "Test Project 3",
          active: true,
          updatedAt: new Date(),
        })
        .run();

      db.insert(leads)
        .values({
          id: "lead3",
          projectId: "proj3",
          handle: "recentuser",
          tweetId: "tweet789",
          status: "contacted",
          urgency: "warm",
          createdAt: new Date(),
          updatedAt: new Date(), // just now, within window
        })
        .run();

      await harness.runJob(JOB_KEYS.followUpCheck);

      // Lead should remain contacted
      const lead = db
        .select()
        .from(leads)
        .where(eq(leads.id, "lead3"))
        .get();
      expect(lead!.status).toBe("contacted");

      // Verify "0 contacted leads" was logged
      const noLeadsLog = harness.logs.find(
        (l) => l.message.includes("0 contacted leads"),
      );
      expect(noLeadsLog).toBeDefined();
    });
  });

  describe("process-outreach", () => {
    it("skips when no pending analysis jobs", async () => {
      await plugin.definition.setup(harness.ctx);

      await harness.runJob(JOB_KEYS.processOutreach);

      const noJobsLog = harness.logs.find(
        (l) => l.message.includes("No pending jobs"),
      );
      expect(noJobsLog).toBeDefined();
    });

    it("picks up a pending analysis job and marks it processing", async () => {
      await plugin.definition.setup(harness.ctx);
      const db = getDb();

      // Insert a pending analysis job
      db.insert(analysisJobs)
        .values({
          id: "job1",
          tweetUrl: "https://x.com/user/status/12345",
          tweetId: "12345",
          status: "pending",
          createdAt: new Date().toISOString(),
        })
        .run();

      // Mock fetch for the tweet analysis API call
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => "Not found",
        json: async () => ({}),
      });

      try {
        await harness.runJob(JOB_KEYS.processOutreach);
      } finally {
        globalThis.fetch = originalFetch;
      }

      // The job should have been picked up (status changed from pending)
      const job = db
        .select()
        .from(analysisJobs)
        .where(eq(analysisJobs.id, "job1"))
        .get();
      expect(job).toBeDefined();
      // It should be failed since we returned 404 from mock
      expect(job!.status).toBe("failed");
    });
  });
});
