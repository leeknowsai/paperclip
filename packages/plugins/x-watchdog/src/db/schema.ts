import {
  sqliteTable,
  text,
  integer,
  real,
  primaryKey,
} from "drizzle-orm/sqlite-core";

// Key-value config store (mirrors D1 configs table)
export const configs = sqliteTable("configs", {
  key: text("key").primaryKey(),
  value: text("value"),
});

export const handles = sqliteTable("handles", {
  id: text("id").primaryKey(),
  username: text("username").notNull(),
  displayName: text("display_name"),
  category: text("category"),
  batchGroup: integer("batch_group"),
  addedAt: integer("added_at", { mode: "timestamp" }),
  active: integer("active", { mode: "boolean" }).default(true),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
  // Enrichment fields
  bio: text("bio"),
  followersCount: integer("followers_count"),
  followingCount: integer("following_count"),
  xTweetCount: integer("x_tweet_count"),
  location: text("location"),
  verified: integer("verified", { mode: "boolean" }),
  profileImageUrl: text("profile_image_url"),
  website: text("website"),
  xCreatedAt: text("x_created_at"),
  enrichedAt: integer("enriched_at", { mode: "timestamp" }),
  enrichmentSource: text("enrichment_source"),
});

export const tweets = sqliteTable("tweets", {
  id: text("id").primaryKey(),
  handleId: text("handle_id")
    .notNull()
    .references(() => handles.id),
  content: text("content"),
  createdAt: integer("created_at", { mode: "timestamp" }),
  fetchedAt: integer("fetched_at", { mode: "timestamp" }),
  aiScore: real("ai_score"),
  aiSummary: text("ai_summary"),
  aiTags: text("ai_tags"),
  notified: integer("notified", { mode: "boolean" }).default(false),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
});

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  tgTopicId: integer("tg_topic_id"),
  syncIntervalHours: integer("sync_interval_hours").default(24),
  lastSyncedAt: integer("last_synced_at", { mode: "timestamp" }),
  active: integer("active", { mode: "boolean" }).default(true),
  scoringPrompt: text("scoring_prompt"),
  // BD outreach config per project
  triggerKeywords: text("trigger_keywords"),       // JSON array of keywords
  bdPriorityThreshold: integer("bd_priority_threshold").default(5),
  speedTier: text("speed_tier").default("cron"),   // 'cron' | 'stream'
  outreachChannels: text("outreach_channels"),     // JSON array: ['x_dm','telegram',...]
  outreachTemplates: text("outreach_templates"),   // JSON: {x_dm: "...", telegram: "..."}
  projectDocs: text("project_docs"),               // Markdown: product info, pitch points
  updatedAt: integer("updated_at", { mode: "timestamp" }),
  // New fields for Paperclip plugin
  tgGroupId: text("tg_group_id"),
  tgGroupInviteLink: text("tg_group_invite_link"),
  discordForumPostId: text("discord_forum_post_id"),
});

export const projectHandles = sqliteTable(
  "project_handles",
  {
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id),
    handleId: text("handle_id")
      .notNull()
      .references(() => handles.id),
  },
  (table) => [primaryKey({ columns: [table.projectId, table.handleId] })],
);

// Outreach analysis job queue
export const analysisJobs = sqliteTable("analysis_jobs", {
  id: text("id").primaryKey(),
  tweetUrl: text("tweet_url").notNull(),
  tweetId: text("tweet_id").notNull(),
  projectId: text("project_id").references(() => projects.id),
  requestedBy: text("requested_by"),
  tgMessageId: integer("tg_message_id"),
  tgChatId: text("tg_chat_id"),
  tgTopicId: integer("tg_topic_id"),
  status: text("status").notNull().default("pending"),
  createdAt: text("created_at").notNull(),
  completedAt: text("completed_at"),
});

// AI outreach analysis results
export const outreachAnalyses = sqliteTable("outreach_analyses", {
  id: text("id").primaryKey(),
  jobId: text("job_id")
    .notNull()
    .references(() => analysisJobs.id),
  tweetId: text("tweet_id").notNull(),
  projectId: text("project_id").references(() => projects.id),
  tweetData: text("tweet_data"),
  conversation: text("conversation"),
  aiResult: text("ai_result"),
  aiModel: text("ai_model"),
  priority: text("priority"),
  score: integer("score"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at"),
});

// BD team outreach action tracking
export const outreachActions = sqliteTable("outreach_actions", {
  id: text("id").primaryKey(),
  analysisId: text("analysis_id")
    .notNull()
    .references(() => outreachAnalyses.id),
  assignee: text("assignee"),
  status: text("status").notNull().default("new"),
  notes: text("notes"),
  followUpAt: text("follow_up_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// Proactive BD leads — auto-detected from tweet signals
export const leads = sqliteTable("leads", {
  id: text("id").primaryKey(),
  projectId: text("project_id").references(() => projects.id),
  handle: text("handle").notNull(),
  tweetId: text("tweet_id").notNull(),
  signalType: text("signal_type"),               // product_launch, partnership, milestone, etc.
  contextPack: text("context_pack"),             // JSON: full ContextPack
  status: text("status").notNull().default("new"), // new/reviewing/sent/skipped/snoozed
  urgency: text("urgency").default("warm"),      // hot/warm/cold
  channelsAvailable: text("channels_available"), // JSON: {x_dm: true, tg: false, ...}
  draftedMessages: text("drafted_messages"),     // JSON: {x_dm: "...", tg: "..."}
  sentChannels: text("sent_channels"),           // JSON array of channels used
  bdNotes: text("bd_notes"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  // New fields for Paperclip plugin
  detectedTgHandle: text("detected_tg_handle"),
  tgGroupInvited: integer("tg_group_invited", { mode: "boolean" }).default(false),
  tgGroupJoined: integer("tg_group_joined", { mode: "boolean" }).default(false),
});

// DM conversations — stored from X API dm_events
export const dmConversations = sqliteTable("dm_conversations", {
  id: text("id").primaryKey(),                    // X conversation_id
  accountUsername: text("account_username").notNull(),
  participantUsernames: text("participant_usernames"), // JSON array of usernames
  lastDmAt: text("last_dm_at"),
  lastDmPreview: text("last_dm_preview"),
  detectedTgHandles: text("detected_tg_handles"),   // JSON array of TG handles found
  projectId: text("project_id").references(() => projects.id),
  syncedAt: integer("synced_at"),                    // unix seconds
});

// DM events — individual messages within conversations
export const dmEvents = sqliteTable("dm_events", {
  id: text("id").primaryKey(),                    // X event_id
  conversationId: text("conversation_id")
    .notNull()
    .references(() => dmConversations.id),
  senderId: text("sender_id").notNull(),
  senderUsername: text("sender_username"),
  text: text("text"),
  eventType: text("event_type").default("MessageCreate"),
  createdAt: text("created_at"),
  syncedAt: integer("synced_at"),                    // unix seconds
});

// Action log — X write operations audit trail (reply, DM)
export const actionLog = sqliteTable("action_log", {
  id: text("id").primaryKey(),
  actionType: text("action_type").notNull(),
  targetTweetId: text("target_tweet_id"),
  targetUserId: text("target_user_id"),
  targetUsername: text("target_username"),
  content: text("content").notNull(),
  xResponseId: text("x_response_id"),
  status: text("status").notNull().default("pending"),
  error: text("error"),
  requestedBy: text("requested_by"),
  idempotencyKey: text("idempotency_key"),
  analysisId: text("analysis_id"),
  createdAt: text("created_at").notNull(),
  completedAt: text("completed_at"),
});

// Outreach action log — tracks messages sent per channel
export const outreachLog = sqliteTable("outreach_log", {
  id: text("id").primaryKey(),
  leadId: text("lead_id").references(() => leads.id),
  channel: text("channel").notNull(),            // x_dm/telegram/discord/email/linkedin
  action: text("action").notNull(),              // sent/replied/followed
  message: text("message"),                      // actual message sent
  status: text("status").notNull().default("pending"), // pending/delivered/failed
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// TG group messages — synced from Telegram group conversations
export const tgGroupMessages = sqliteTable("tg_group_messages", {
  id: text("id").primaryKey(),                    // Telegram message_id as string
  groupId: text("group_id").notNull(),            // Telegram chat/group ID
  projectId: text("project_id").references(() => projects.id),
  senderId: text("sender_id"),                    // Telegram user ID
  senderUsername: text("sender_username"),
  text: text("text"),
  messageType: text("message_type").default("text"), // text/photo/document/etc.
  replyToId: text("reply_to_id"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  syncedAt: integer("synced_at", { mode: "timestamp" }),
});

// TG group members — tracked members of Telegram groups per project
export const tgGroupMembers = sqliteTable("tg_group_members", {
  id: text("id").primaryKey(),
  groupId: text("group_id").notNull(),
  projectId: text("project_id").references(() => projects.id),
  userId: text("user_id").notNull(),
  username: text("username"),
  displayName: text("display_name"),
  leadId: text("lead_id").references(() => leads.id), // matched lead if any
  status: text("status").default("member"),      // member/left/kicked/admin
  joinedAt: integer("joined_at", { mode: "timestamp" }),
  leftAt: integer("left_at", { mode: "timestamp" }),
  syncedAt: integer("synced_at", { mode: "timestamp" }),
});

// Outreach retrospectives — AI post-mortem analysis of closed leads
export const outreachRetrospectives = sqliteTable("outreach_retrospectives", {
  id: text("id").primaryKey(),
  leadId: text("lead_id").references(() => leads.id),
  projectId: text("project_id").references(() => projects.id),
  outcome: text("outcome").notNull(),            // converted/rejected/no_response/snoozed
  aiAnalysis: text("ai_analysis"),               // JSON: lessons learned, what worked
  aiModel: text("ai_model"),
  channelsUsed: text("channels_used"),           // JSON array
  totalFollowUps: integer("total_follow_ups").default(0),
  daysToClose: integer("days_to_close"),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});
