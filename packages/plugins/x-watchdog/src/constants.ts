export const PLUGIN_ID = "x-watchdog";
export const PLUGIN_VERSION = "0.1.0";

export const TOOL_NAMES = {
  searchX: "x-search",
  scrapeX: "x-scrape",
  scoreTweet: "score-tweet",
  sendReply: "send-reply",
  sendDm: "send-dm",
  outreachRetrospective: "outreach-retrospective",
} as const;

export const JOB_KEYS = {
  hourlyFetch: "hourly-fetch",
  dmSync: "dm-sync",
  processOutreach: "process-outreach",
  followUpCheck: "follow-up-check",
  tgGroupSync: "tg-group-sync",
  weeklyRetrospective: "weekly-retrospective",
  dailyCleanup: "daily-cleanup",
} as const;

export const SLOT_IDS = {
  dashboard: "x-watchdog-dashboard",
  pipelineSummary: "x-watchdog-pipeline-summary",
  settings: "x-watchdog-settings",
} as const;

export const EXPORT_NAMES = {
  dashboard: "WatchdogDashboard",
  pipelineSummary: "PipelineSummary",
  settings: "WatchdogSettings",
} as const;

// ctx.state uses scope objects: { scopeKind: "instance", stateKey: "..." }
// No list() method — use a registry key to track connected accounts
export const STATE_KEYS = {
  oauthPkce: (state: string) => ({ scopeKind: "instance" as const, stateKey: `oauth_pkce_${state}` }),
  oauthToken: (username: string) => ({ scopeKind: "instance" as const, stateKey: `oauth_token_${username}` }),
  oauthAccounts: { scopeKind: "instance" as const, stateKey: "oauth_connected_accounts" },
  tgSession: { scopeKind: "instance" as const, stateKey: "tg_session" },
  lastSync: (jobKey: string) => ({ scopeKind: "instance" as const, stateKey: `last_sync_${jobKey}` }),
} as const;

export const EVENT_NAMES = {
  highScore: "plugin.x-watchdog.high-score",
  newLead: "plugin.x-watchdog.new-lead",
  outreachReady: "plugin.x-watchdog.outreach-ready",
  approvalNeeded: "plugin.x-watchdog.approval-needed",
  dmSendRequest: "plugin.x-watchdog.dm-send-request",
  dmReplyReceived: "plugin.x-watchdog.dm-reply-received",
  tgHandleDetected: "plugin.x-watchdog.tg-handle-detected",
  tgInviteReady: "plugin.x-watchdog.tg-invite-ready",
  followUpNeeded: "plugin.x-watchdog.follow-up-needed",
  leadConverted: "plugin.x-watchdog.lead-converted",
  tgMessage: "plugin.x-watchdog.tg-message",
  tgMemberJoined: "plugin.x-watchdog.tg-member-joined",
  tgMemberLeft: "plugin.x-watchdog.tg-member-left",
  ceoDecision: "plugin.x-watchdog.ceo-decision",
  ceoProposal: "plugin.x-watchdog.ceo-proposal",
  retrospectiveReady: "plugin.x-watchdog.retrospective-ready",
  error: "plugin.x-watchdog.error",
  tokenExpiry: "plugin.x-watchdog.token-expiry",
  creditsDepleted: "plugin.x-watchdog.credits-depleted",
  dailyReport: "plugin.x-watchdog.daily-report",
} as const;
