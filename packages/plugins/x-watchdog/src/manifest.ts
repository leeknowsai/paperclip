import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";
import {
  EXPORT_NAMES,
  JOB_KEYS,
  PLUGIN_ID,
  PLUGIN_VERSION,
  SLOT_IDS,
  TOOL_NAMES,
} from "./constants.js";

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: PLUGIN_VERSION,
  displayName: "X Watchdog",
  description:
    "BD pipeline for monitoring X accounts, AI-scoring tweets, automated outreach, and DM conversation tracking. Identifies high-value leads, engages them, and moves conversations to Telegram.",
  author: "X Watchdog",
  categories: ["automation", "connector"],

  capabilities: [
    "http.outbound",
    "secrets.read-ref",
    "plugin.state.read",
    "plugin.state.write",
    "events.subscribe",
    "events.emit",
    "agent.tools.register",
    "jobs.schedule",
    "webhooks.receive",
    "activity.log.write",
    "issues.read",
    "issues.create",
    "instance.settings.register",
    "ui.page.register",
    "ui.dashboardWidget.register",
  ],

  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui/",
  },

  instanceConfigSchema: {
    type: "object",
    properties: {
      xBearerTokenRef: {
        type: "string",
        title: "X Bearer Token (secret ref)",
        description: "Secret reference for X API Bearer Token",
      },
      openaiApiKeyRef: {
        type: "string",
        title: "OpenAI API Key (secret ref)",
        description: "Secret reference for OpenAI API key used for AI scoring",
      },
      twitterApiIoKeyRef: {
        type: "string",
        title: "TwitterAPI.io Key (secret ref)",
        description: "Secret reference for TwitterAPI.io key used for bio enrichment",
      },
      xOAuthClientId: {
        type: "string",
        title: "X OAuth Client ID",
        description: "X OAuth 2.0 client ID for DM access",
      },
      xOAuthClientSecretRef: {
        type: "string",
        title: "X OAuth Client Secret (secret ref)",
        description: "Secret reference for X OAuth 2.0 client secret",
      },
      notificationThreshold: {
        type: "number",
        title: "Notification Score Threshold",
        description: "Minimum AI score to trigger lead notification",
        default: 7,
      },
      discordNotify: {
        type: "boolean",
        title: "Discord Notifications",
        description: "Send lead notifications to Discord",
        default: true,
      },
      maxFollowUps: {
        type: "number",
        title: "Max Follow-ups",
        description: "Maximum number of follow-up messages per lead",
        default: 3,
      },
      followUpWaitHours: {
        type: "number",
        title: "Follow-up Wait Hours",
        description: "Hours to wait between follow-up messages",
        default: 48,
      },
      tgSyncEnabled: {
        type: "boolean",
        title: "Telegram Group Sync",
        description: "Enable syncing Telegram group messages and members",
        default: false,
      },
      discordChannels: {
        type: "object",
        title: "Discord Channel IDs",
        description: "Channel routing for Discord notifications",
        properties: {
          bdPipeline: {
            type: "string",
            title: "BD Pipeline Channel ID",
          },
          approvals: {
            type: "string",
            title: "Approvals Channel ID",
          },
          errors: {
            type: "string",
            title: "Errors Channel ID",
          },
        },
      },
    },
  },

  jobs: [
    {
      jobKey: JOB_KEYS.hourlyFetch,
      displayName: "Hourly Fetch & Score",
      description: "Fetch latest tweets from monitored handles and AI-score them",
      schedule: "0 * * * *",
    },
    {
      jobKey: JOB_KEYS.dmSync,
      displayName: "DM Sync",
      description: "Sync X DM conversations and detect Telegram handles",
      schedule: "*/30 * * * *",
    },
    {
      jobKey: JOB_KEYS.processOutreach,
      displayName: "Process Outreach",
      description: "Process pending leads and send approved outreach messages",
      schedule: "*/15 * * * *",
    },
    {
      jobKey: JOB_KEYS.followUpCheck,
      displayName: "Follow-up Check",
      description: "Check for leads needing follow-up and queue messages",
      schedule: "0 */4 * * *",
    },
    {
      jobKey: JOB_KEYS.tgGroupSync,
      displayName: "Telegram Group Sync",
      description: "Sync Telegram group messages and member activity",
      schedule: "0 */2 * * *",
    },
    {
      jobKey: JOB_KEYS.weeklyRetrospective,
      displayName: "Weekly Retrospective",
      description: "Generate AI retrospective analysis of outreach performance",
      schedule: "0 9 * * 1",
    },
    {
      jobKey: JOB_KEYS.dailyCleanup,
      displayName: "Daily Cleanup",
      description: "Clean up old data, sync handle enrichment, generate daily report",
      schedule: "0 3 * * *",
    },
  ],

  webhooks: [
    {
      endpointKey: "oauth-callback",
      displayName: "X OAuth Callback",
      description: "Handles OAuth 2.0 PKCE callback from X to store access tokens",
    },
  ],

  tools: [
    {
      name: TOOL_NAMES.searchX,
      displayName: "X Search",
      description:
        "Search X for tweets matching keywords and store results for scoring",
      parametersSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query string",
          },
          projectId: {
            type: "string",
            description: "Project ID to associate results with",
          },
          limit: {
            type: "number",
            description: "Maximum number of results to fetch",
          },
        },
        required: ["query"],
      },
    },
    {
      name: TOOL_NAMES.scrapeX,
      displayName: "X Scrape Profile",
      description:
        "Fetch and enrich a Twitter/X profile including bio, follower count, and recent tweets",
      parametersSchema: {
        type: "object",
        properties: {
          username: {
            type: "string",
            description: "X username (without @)",
          },
        },
        required: ["username"],
      },
    },
    {
      name: TOOL_NAMES.scoreTweet,
      displayName: "Score Tweet",
      description:
        "AI-score a tweet for BD relevance against a project's scoring prompt",
      parametersSchema: {
        type: "object",
        properties: {
          tweetId: {
            type: "string",
            description: "Tweet ID to score",
          },
          projectId: {
            type: "string",
            description: "Project ID for context and scoring prompt",
          },
        },
        required: ["tweetId", "projectId"],
      },
    },
    {
      name: TOOL_NAMES.sendReply,
      displayName: "Send X Reply",
      description:
        "Post a reply to a tweet using OAuth 1.0a. Supports dryRun mode.",
      parametersSchema: {
        type: "object",
        properties: {
          tweetId: {
            type: "string",
            description: "Tweet ID to reply to",
          },
          message: {
            type: "string",
            description: "Reply message content",
          },
          dryRun: {
            type: "boolean",
            description: "If true, log the action without posting to X",
          },
        },
        required: ["tweetId", "message"],
      },
    },
    {
      name: TOOL_NAMES.sendDm,
      displayName: "Send X DM",
      description:
        "Send a direct message on X using OAuth 1.0a. Supports dryRun mode.",
      parametersSchema: {
        type: "object",
        properties: {
          username: {
            type: "string",
            description: "X username to DM (without @)",
          },
          message: {
            type: "string",
            description: "DM content",
          },
          leadId: {
            type: "string",
            description: "Lead ID to associate this DM with",
          },
          dryRun: {
            type: "boolean",
            description: "If true, log the action without posting to X",
          },
        },
        required: ["username", "message"],
      },
    },
    {
      name: TOOL_NAMES.outreachRetrospective,
      displayName: "Outreach Retrospective",
      description:
        "Generate an AI retrospective analysis for a closed lead, capturing lessons learned",
      parametersSchema: {
        type: "object",
        properties: {
          leadId: {
            type: "string",
            description: "Lead ID to analyze",
          },
          outcome: {
            type: "string",
            description: "Final outcome: converted | rejected | no_response | snoozed",
          },
          notes: {
            type: "string",
            description: "Optional human notes about the lead outcome",
          },
        },
        required: ["leadId", "outcome"],
      },
    },
  ],

  ui: {
    slots: [
      {
        type: "page",
        id: SLOT_IDS.dashboard,
        displayName: "X Watchdog Dashboard",
        exportName: EXPORT_NAMES.dashboard,
      },
      {
        type: "dashboardWidget",
        id: SLOT_IDS.pipelineSummary,
        displayName: "Pipeline Summary",
        exportName: EXPORT_NAMES.pipelineSummary,
      },
      {
        type: "settingsPage",
        id: SLOT_IDS.settings,
        displayName: "X Watchdog Settings",
        exportName: EXPORT_NAMES.settings,
      },
    ],
  },
};

export default manifest;
