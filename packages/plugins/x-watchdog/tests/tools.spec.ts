import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestHarness, type TestHarness } from "@paperclipai/plugin-sdk/testing";
import type { ToolResult } from "@paperclipai/plugin-sdk";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";
import { getDb, closeDb, pushSchema } from "../src/db/index.js";
import { TOOL_NAMES } from "../src/constants.js";
import {
  handles,
  tweets,
  actionLog,
} from "../src/db/schema.js";
import { eq } from "drizzle-orm";

// Mock resolveConfig — factory must always return the mock (vi.restoreAllMocks won't reset it)
vi.mock("../src/lib/config.js", () => ({
  resolveConfig: () =>
    Promise.resolve({
      xBearerToken: "test-bearer-token",
      openaiApiKey: "test-openai-key",
      twitterApiIoKey: undefined,
      notificationThreshold: 7,
      maxFollowUps: 2,
      followUpWaitHours: 48,
    }),
}));

// Mock LLM providers globally — hoisted by vitest
vi.mock("../src/lib/llm-providers.js", () => ({
  createLlmClient: () => ({
    chatCompletion: () =>
      Promise.resolve(
        JSON.stringify({ score: 8, summary: "DeFi launch", tags: ["defi", "launch"] }),
      ),
  }),
  getAvailableProviders: () => [{ id: "openai", models: [{ id: "gpt-4.1-mini" }] }],
}));

// Mock x-data-router globally
vi.mock("../src/lib/x-data-router.js", () => ({
  createXDataRouter: () => ({
    searchTweets: () =>
      Promise.resolve({ data: { tweets: [] }, source: "mock" }),
    lookupUser: () =>
      Promise.resolve({ profile: null, source: "mock" }),
    getUserTimeline: () =>
      Promise.resolve({ data: { tweets: [] }, source: "mock" }),
  }),
}));

let dataDir: string;
let harness: TestHarness;

function setupHarness() {
  dataDir = `/tmp/x-watchdog-test-tools-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const db = getDb(dataDir);
  pushSchema(db);

  harness = createTestHarness({
    manifest,
    config: {
      xBearerTokenRef: "test-bearer-ref",
      openaiApiKeyRef: "test-openai-ref",
    },
  });
}

describe("tools", () => {
  beforeEach(() => {
    setupHarness();
  });

  afterEach(() => {
    closeDb();
    try {
      const fs = require("node:fs");
      fs.rmSync(dataDir, { recursive: true, force: true });
    } catch { /* ignore */ }
  });

  describe("score-tweet", () => {
    it("returns error when tweetId is missing", async () => {
      await plugin.definition.setup(harness.ctx);

      const result = await harness.executeTool<ToolResult>(
        TOOL_NAMES.scoreTweet,
        { tweetId: "" },
      );
      const parsed = JSON.parse(result.content);
      expect(parsed.error).toContain("tweetId is required");
    });

    it("returns error when tweet not found in DB", async () => {
      await plugin.definition.setup(harness.ctx);

      const result = await harness.executeTool<ToolResult>(
        TOOL_NAMES.scoreTweet,
        { tweetId: "nonexistent_123" },
      );
      const parsed = JSON.parse(result.content);
      expect(parsed.error).toContain("not found in local DB");
    });

    it("scores a tweet and persists the result", async () => {
      await plugin.definition.setup(harness.ctx);
      const db = getDb();

      // Insert handle and tweet
      db.insert(handles)
        .values({
          id: "h1",
          username: "testuser",
          active: true,
          addedAt: new Date(),
          updatedAt: new Date(),
        })
        .run();

      db.insert(tweets)
        .values({
          id: "tweet_score_1",
          handleId: "h1",
          content: "We just launched our new DeFi protocol with 10x yields!",
          createdAt: new Date(),
          fetchedAt: new Date(),
          updatedAt: new Date(),
        })
        .run();

      const result = await harness.executeTool<ToolResult>(
        TOOL_NAMES.scoreTweet,
        { tweetId: "tweet_score_1" },
      );

      const parsed = JSON.parse(result.content);
      expect(parsed.ok).toBe(true);
      expect(parsed.score).toBe(8);
      expect(parsed.summary).toBe("DeFi launch");
      expect(parsed.tags).toEqual(["defi", "launch"]);

      // Verify score was persisted in DB
      const updatedTweet = db
        .select()
        .from(tweets)
        .where(eq(tweets.id, "tweet_score_1"))
        .get();
      expect(updatedTweet!.aiScore).toBe(0.8); // score/10
      expect(updatedTweet!.aiSummary).toBe("DeFi launch");
    });
  });

  describe("search-x", () => {
    it("returns error when query is missing", async () => {
      await plugin.definition.setup(harness.ctx);

      const result = await harness.executeTool<ToolResult>(
        TOOL_NAMES.searchX,
        { query: "" },
      );
      const parsed = JSON.parse(result.content);
      expect(parsed.error).toContain("query is required");
    });

    it("returns zero results when API returns empty", async () => {
      await plugin.definition.setup(harness.ctx);

      const result = await harness.executeTool<ToolResult>(
        TOOL_NAMES.searchX,
        { query: "defi protocol" },
      );
      const parsed = JSON.parse(result.content);
      expect(parsed.ok).toBe(true);
      expect(parsed.found).toBe(0);
    });
  });

  describe("scrape-x", () => {
    it("returns error when username is missing", async () => {
      await plugin.definition.setup(harness.ctx);

      const result = await harness.executeTool<ToolResult>(
        TOOL_NAMES.scrapeX,
        { username: "" },
      );
      const parsed = JSON.parse(result.content);
      expect(parsed.error).toContain("username is required");
    });
  });

  describe("send-reply", () => {
    it("returns error when tweetId is missing", async () => {
      await plugin.definition.setup(harness.ctx);

      const result = await harness.executeTool<ToolResult>(
        TOOL_NAMES.sendReply,
        { tweetId: "", message: "hello" },
      );
      const parsed = JSON.parse(result.content);
      expect(parsed.error).toContain("tweetId is required");
    });

    it("returns error when message is missing", async () => {
      await plugin.definition.setup(harness.ctx);

      const result = await harness.executeTool<ToolResult>(
        TOOL_NAMES.sendReply,
        { tweetId: "123", message: "" },
      );
      const parsed = JSON.parse(result.content);
      expect(parsed.error).toContain("message is required");
    });

    it("handles dry run mode correctly", async () => {
      await plugin.definition.setup(harness.ctx);
      const db = getDb();

      const result = await harness.executeTool<ToolResult>(
        TOOL_NAMES.sendReply,
        { tweetId: "tweet_dry_1", message: "Great thread!", dryRun: true },
      );

      const parsed = JSON.parse(result.content);
      expect(parsed.ok).toBe(true);
      expect(parsed.dryRun).toBe(true);
      expect(parsed.tweetId).toBe("tweet_dry_1");
      expect(parsed.message).toBe("Great thread!");

      // Verify dry run was logged in action_log
      const logs = db.select().from(actionLog).all();
      const dryRunLog = logs.find(
        (l) => l.targetTweetId === "tweet_dry_1" && l.status === "dry_run",
      );
      expect(dryRunLog).toBeDefined();
      expect(dryRunLog!.actionType).toBe("reply");
      expect(dryRunLog!.content).toBe("Great thread!");
    });
  });

  describe("send-dm", () => {
    it("returns error when username is missing", async () => {
      await plugin.definition.setup(harness.ctx);

      const result = await harness.executeTool<ToolResult>(
        TOOL_NAMES.sendDm,
        { username: "", message: "hello" },
      );
      const parsed = JSON.parse(result.content);
      expect(parsed.error).toContain("username is required");
    });

    it("returns error when message is missing", async () => {
      await plugin.definition.setup(harness.ctx);

      const result = await harness.executeTool<ToolResult>(
        TOOL_NAMES.sendDm,
        { username: "someone", message: "" },
      );
      const parsed = JSON.parse(result.content);
      expect(parsed.error).toContain("message is required");
    });

    it("handles dry run mode correctly", async () => {
      await plugin.definition.setup(harness.ctx);
      const db = getDb();

      const result = await harness.executeTool<ToolResult>(
        TOOL_NAMES.sendDm,
        { username: "targetuser", message: "Hey, interested in collab?", dryRun: true },
      );

      const parsed = JSON.parse(result.content);
      expect(parsed.ok).toBe(true);
      expect(parsed.dryRun).toBe(true);
      expect(parsed.username).toBe("targetuser");

      // Verify dry run was logged
      const logs = db.select().from(actionLog).all();
      const dryRunLog = logs.find(
        (l) => l.targetUsername === "targetuser" && l.status === "dry_run",
      );
      expect(dryRunLog).toBeDefined();
      expect(dryRunLog!.actionType).toBe("dm");
    });
  });

  describe("outreach-retrospective", () => {
    it("returns error when neither leadId nor periodDays provided", async () => {
      await plugin.definition.setup(harness.ctx);

      const result = await harness.executeTool<ToolResult>(
        TOOL_NAMES.outreachRetrospective,
        {},
      );
      const parsed = JSON.parse(result.content);
      expect(parsed.error).toContain("leadId or periodDays required");
    });

    it("returns error when lead not found", async () => {
      await plugin.definition.setup(harness.ctx);

      const result = await harness.executeTool<ToolResult>(
        TOOL_NAMES.outreachRetrospective,
        { leadId: "nonexistent", outcome: "converted" },
      );
      const parsed = JSON.parse(result.content);
      expect(parsed.error).toContain("not found");
    });

    it("returns no leads message for batch mode with no terminal leads", async () => {
      await plugin.definition.setup(harness.ctx);

      const result = await harness.executeTool<ToolResult>(
        TOOL_NAMES.outreachRetrospective,
        { periodDays: 7 },
      );
      const parsed = JSON.parse(result.content);
      expect(parsed.ok).toBe(true);
      expect(parsed.count).toBe(0);
      expect(parsed.message).toContain("No terminal leads");
    });
  });
});
