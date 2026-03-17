// Registers all agent tool handlers with the plugin context.

import type { PluginContext, ToolRunContext, ToolResult } from "@paperclipai/plugin-sdk";
import { TOOL_NAMES } from "../constants.js";
import { handleSearchX } from "./search-x.js";
import { handleScrapeX } from "./scrape-x.js";
import { handleScoreTweet } from "./score-tweet.js";
import { handleSendReply } from "./send-reply.js";
import { handleSendDm } from "./send-dm.js";
import { handleOutreachRetrospectiveTool } from "./outreach-retrospective.js";
import { handleChromeOpen } from "./chrome-open.js";
import { handleChromeScrape } from "./chrome-scrape.js";
import { handleChromeSetup } from "./chrome-setup.js";

export function registerToolHandlers(ctx: PluginContext): void {
  ctx.tools.register(
    TOOL_NAMES.searchX,
    {
      displayName: "X Search",
      description:
        "Search X for tweets matching keywords, store results, and AI-score them for BD relevance.",
      parametersSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query string" },
          projectId: { type: "string", description: "Project ID to associate results with" },
          limit: { type: "number", description: "Maximum number of results to process" },
        },
        required: ["query"],
      },
    },
    (p: unknown, r: ToolRunContext): Promise<ToolResult> => handleSearchX(ctx, p, r),
  );

  ctx.tools.register(
    TOOL_NAMES.scrapeX,
    {
      displayName: "X Scrape Profile",
      description:
        "Fetch and enrich an X profile (bio, followers, recent tweets) and store in local DB.",
      parametersSchema: {
        type: "object",
        properties: {
          username: { type: "string", description: "X username (without @)" },
        },
        required: ["username"],
      },
    },
    (p: unknown, r: ToolRunContext): Promise<ToolResult> => handleScrapeX(ctx, p, r),
  );

  ctx.tools.register(
    TOOL_NAMES.scoreTweet,
    {
      displayName: "Score Tweet",
      description:
        "AI-score a tweet already in the local DB for BD relevance, optionally using a project's scoring prompt.",
      parametersSchema: {
        type: "object",
        properties: {
          tweetId: { type: "string", description: "Tweet ID to score" },
          projectId: { type: "string", description: "Project ID for context and scoring prompt" },
        },
        required: ["tweetId"],
      },
    },
    (p: unknown, r: ToolRunContext): Promise<ToolResult> => handleScoreTweet(ctx, p, r),
  );

  ctx.tools.register(
    TOOL_NAMES.sendReply,
    {
      displayName: "Send X Reply",
      description:
        "Post a reply to a tweet using a stored OAuth 2.0 access token. Supports dryRun mode.",
      parametersSchema: {
        type: "object",
        properties: {
          tweetId: { type: "string", description: "Tweet ID to reply to" },
          message: { type: "string", description: "Reply message content" },
          dryRun: { type: "boolean", description: "If true, log without posting to X" },
        },
        required: ["tweetId", "message"],
      },
    },
    (p: unknown, r: ToolRunContext): Promise<ToolResult> => handleSendReply(ctx, p, r),
  );

  ctx.tools.register(
    TOOL_NAMES.sendDm,
    {
      displayName: "Send X DM",
      description:
        "Send a Direct Message on X using a stored OAuth 2.0 access token. Supports dryRun mode.",
      parametersSchema: {
        type: "object",
        properties: {
          username: { type: "string", description: "X username to DM (without @)" },
          message: { type: "string", description: "DM content" },
          leadId: { type: "string", description: "Lead ID to associate this DM with" },
          dryRun: { type: "boolean", description: "If true, log without posting to X" },
        },
        required: ["username", "message"],
      },
    },
    (p: unknown, r: ToolRunContext): Promise<ToolResult> => handleSendDm(ctx, p, r),
  );

  ctx.tools.register(
    TOOL_NAMES.outreachRetrospective,
    {
      displayName: "Outreach Retrospective",
      description:
        "Generate an AI retrospective analysis for a closed lead or batch of leads within a period.",
      parametersSchema: {
        type: "object",
        properties: {
          leadId: { type: "string", description: "Lead ID to analyze (single lead mode)" },
          outcome: {
            type: "string",
            description: "Final outcome: converted | rejected | no_response | snoozed",
          },
          notes: { type: "string", description: "Optional human notes about the outcome" },
          periodDays: { type: "number", description: "Analyze terminal leads from the last N days (batch mode)" },
          projectId: { type: "string", description: "Filter by project ID" },
        },
      },
    },
    (p: unknown, r: ToolRunContext): Promise<ToolResult> => handleOutreachRetrospectiveTool(ctx, p, r),
  );

  ctx.tools.register(
    TOOL_NAMES.chromeOpen,
    {
      displayName: "Chrome Open X Search",
      description:
        "Open X search tabs in Chrome profiles for each active project's keywords. Run before chrome-scrape.",
      parametersSchema: {
        type: "object",
        properties: {},
      },
    },
    (p: unknown, r: ToolRunContext): Promise<ToolResult> => handleChromeOpen(ctx, p, r),
  );

  ctx.tools.register(
    TOOL_NAMES.chromeScrape,
    {
      displayName: "Chrome Scrape X Tabs",
      description:
        "Scrape tweets from open X search tabs via CDP, AI-score them, store to DB, and detect leads.",
      parametersSchema: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Max number of tabs to scrape" },
          skipScore: { type: "boolean", description: "Skip AI scoring (store raw tweets only)" },
        },
      },
    },
    (p: unknown, r: ToolRunContext): Promise<ToolResult> => handleChromeScrape(ctx, p, r),
  );

  ctx.tools.register(
    TOOL_NAMES.chromeSetup,
    {
      displayName: "Chrome Profile Setup",
      description:
        "Create Chrome profiles for each account in the account map, injecting X auth cookies.",
      parametersSchema: {
        type: "object",
        properties: {
          sourceProfile: {
            type: "string",
            description: "Chrome profile directory to copy cookies from (default: Default)",
          },
        },
      },
    },
    (p: unknown, r: ToolRunContext): Promise<ToolResult> => handleChromeSetup(ctx, p, r),
  );

  ctx.logger.info("Tool handlers registered: search-x, scrape-x, score-tweet, send-reply, send-dm, outreach-retrospective, chrome-open, chrome-scrape, chrome-setup");
}
