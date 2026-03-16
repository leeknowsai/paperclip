import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";
import path from "node:path";
import fs from "node:fs";

let _db: ReturnType<typeof drizzle> | null = null;
let _sqlite: Database.Database | null = null;

export function getDb(dataDir?: string): ReturnType<typeof drizzle> {
  if (_db) return _db;
  const dir = dataDir ?? path.join(process.cwd(), ".x-watchdog-data");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const dbPath = path.join(dir, "data.db");
  _sqlite = new Database(dbPath);
  _sqlite.pragma("journal_mode = WAL");
  _sqlite.pragma("foreign_keys = ON");
  _db = drizzle(_sqlite, { schema });
  return _db;
}

export function pushSchema(db: ReturnType<typeof drizzle>): void {
  const sqlite = _sqlite;
  if (!sqlite) throw new Error("DB not initialized");
  createTablesIfNotExist(sqlite);
}

function createTablesIfNotExist(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS handles (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      display_name TEXT,
      category TEXT,
      batch_group INTEGER,
      added_at INTEGER,
      active INTEGER DEFAULT 1,
      updated_at INTEGER,
      bio TEXT,
      followers_count INTEGER,
      following_count INTEGER,
      x_tweet_count INTEGER,
      location TEXT,
      verified INTEGER,
      profile_image_url TEXT,
      website TEXT,
      x_created_at TEXT,
      enriched_at INTEGER,
      enrichment_source TEXT
    );

    CREATE TABLE IF NOT EXISTS tweets (
      id TEXT PRIMARY KEY,
      handle_id TEXT NOT NULL REFERENCES handles(id),
      content TEXT,
      created_at INTEGER,
      fetched_at INTEGER,
      ai_score REAL,
      ai_summary TEXT,
      ai_tags TEXT,
      notified INTEGER DEFAULT 0,
      updated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      tg_topic_id INTEGER,
      sync_interval_hours INTEGER DEFAULT 24,
      last_synced_at INTEGER,
      active INTEGER DEFAULT 1,
      scoring_prompt TEXT,
      trigger_keywords TEXT,
      bd_priority_threshold INTEGER DEFAULT 5,
      speed_tier TEXT DEFAULT 'cron',
      outreach_channels TEXT,
      outreach_templates TEXT,
      project_docs TEXT,
      updated_at INTEGER,
      tg_group_id TEXT,
      tg_group_invite_link TEXT,
      discord_forum_post_id TEXT
    );

    CREATE TABLE IF NOT EXISTS project_handles (
      project_id TEXT NOT NULL REFERENCES projects(id),
      handle_id TEXT NOT NULL REFERENCES handles(id),
      PRIMARY KEY (project_id, handle_id)
    );

    CREATE TABLE IF NOT EXISTS analysis_jobs (
      id TEXT PRIMARY KEY,
      tweet_url TEXT NOT NULL,
      tweet_id TEXT NOT NULL,
      project_id TEXT REFERENCES projects(id),
      requested_by TEXT,
      tg_message_id INTEGER,
      tg_chat_id TEXT,
      tg_topic_id INTEGER,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS outreach_analyses (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES analysis_jobs(id),
      tweet_id TEXT NOT NULL,
      project_id TEXT REFERENCES projects(id),
      tweet_data TEXT,
      conversation TEXT,
      ai_result TEXT,
      ai_model TEXT,
      priority TEXT,
      score INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS outreach_actions (
      id TEXT PRIMARY KEY,
      analysis_id TEXT NOT NULL REFERENCES outreach_analyses(id),
      assignee TEXT,
      status TEXT NOT NULL DEFAULT 'new',
      notes TEXT,
      follow_up_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS leads (
      id TEXT PRIMARY KEY,
      project_id TEXT REFERENCES projects(id),
      handle TEXT NOT NULL,
      tweet_id TEXT NOT NULL,
      signal_type TEXT,
      context_pack TEXT,
      status TEXT NOT NULL DEFAULT 'new',
      urgency TEXT DEFAULT 'warm',
      channels_available TEXT,
      drafted_messages TEXT,
      sent_channels TEXT,
      bd_notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      detected_tg_handle TEXT,
      tg_group_invited INTEGER DEFAULT 0,
      tg_group_joined INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS dm_conversations (
      id TEXT PRIMARY KEY,
      account_username TEXT NOT NULL,
      participant_usernames TEXT,
      last_dm_at TEXT,
      last_dm_preview TEXT,
      detected_tg_handles TEXT,
      project_id TEXT REFERENCES projects(id),
      synced_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS dm_events (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES dm_conversations(id),
      sender_id TEXT NOT NULL,
      sender_username TEXT,
      text TEXT,
      event_type TEXT DEFAULT 'MessageCreate',
      created_at TEXT,
      synced_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS action_log (
      id TEXT PRIMARY KEY,
      action_type TEXT NOT NULL,
      target_tweet_id TEXT,
      target_user_id TEXT,
      target_username TEXT,
      content TEXT NOT NULL,
      x_response_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      error TEXT,
      requested_by TEXT,
      idempotency_key TEXT,
      analysis_id TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS outreach_log (
      id TEXT PRIMARY KEY,
      lead_id TEXT REFERENCES leads(id),
      channel TEXT NOT NULL,
      action TEXT NOT NULL,
      message TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tg_group_messages (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL,
      project_id TEXT REFERENCES projects(id),
      sender_id TEXT,
      sender_username TEXT,
      text TEXT,
      message_type TEXT DEFAULT 'text',
      reply_to_id TEXT,
      created_at INTEGER NOT NULL,
      synced_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS tg_group_members (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL,
      project_id TEXT REFERENCES projects(id),
      user_id TEXT NOT NULL,
      username TEXT,
      display_name TEXT,
      lead_id TEXT REFERENCES leads(id),
      status TEXT DEFAULT 'member',
      joined_at INTEGER,
      left_at INTEGER,
      synced_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS outreach_retrospectives (
      id TEXT PRIMARY KEY,
      lead_id TEXT REFERENCES leads(id),
      project_id TEXT REFERENCES projects(id),
      outcome TEXT NOT NULL,
      ai_analysis TEXT,
      ai_model TEXT,
      channels_used TEXT,
      total_follow_ups INTEGER DEFAULT 0,
      days_to_close INTEGER,
      notes TEXT,
      created_at INTEGER NOT NULL
    );
  `);
}

export function closeDb(): void {
  if (_sqlite) {
    _sqlite.close();
    _sqlite = null;
    _db = null;
  }
}
