import {
  type PluginPageProps,
  type PluginWidgetProps,
  type PluginSettingsPageProps,
} from "@paperclipai/plugin-sdk/ui";

// ---------- Shared styles ----------

const styles = {
  container: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "24px",
    padding: "16px",
    maxWidth: "960px",
  },
  section: {
    border: "1px solid #333",
    borderRadius: "8px",
    padding: "16px",
    background: "#1a1a1a",
  },
  sectionTitle: {
    fontSize: "16px",
    fontWeight: 600,
    marginBottom: "8px",
    color: "#e0e0e0",
  },
  placeholder: {
    color: "#666",
    fontSize: "13px",
  },
  badge: {
    display: "inline-block",
    background: "#1d3a5f",
    color: "#60a5fa",
    borderRadius: "4px",
    padding: "2px 8px",
    fontSize: "12px",
    fontWeight: 500,
  },
};

// ---------- WatchdogDashboard — full page slot ----------

export function WatchdogDashboard({ context }: PluginPageProps) {
  return (
    <div style={styles.container}>
      <div>
        <h1 style={{ fontSize: "20px", fontWeight: 700, color: "#e0e0e0", margin: 0 }}>
          X Watchdog
        </h1>
        <p style={{ color: "#666", fontSize: "13px", marginTop: "4px" }}>
          BD pipeline — monitor X accounts, score leads, and manage outreach
        </p>
      </div>

      <div style={styles.section}>
        <div style={styles.sectionTitle}>Pipeline Overview</div>
        <p style={styles.placeholder}>
          Dashboard coming in Phase 2. Feeds, leads, outreach stats, and DM
          conversations will be shown here.
        </p>
      </div>

      <div style={styles.section}>
        <div style={styles.sectionTitle}>Quick Stats</div>
        <p style={styles.placeholder}>
          KPI cards (handles monitored, leads this week, DMs sent, conversion
          rate) coming in Phase 2.
        </p>
      </div>

      <div
        style={{
          ...styles.section,
          background: "#111",
          border: "1px solid #2a2a2a",
        }}
      >
        <div style={{ color: "#555", fontSize: "12px" }}>
          <span style={styles.badge}>Phase 1</span>
          <span style={{ marginLeft: "8px" }}>
            Foundation scaffold — jobs and schema are wired. Business logic
            arrives in Phase 2.
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------- PipelineSummary — dashboard widget slot ----------

export function PipelineSummary({ context }: PluginWidgetProps) {
  return (
    <div
      style={{
        padding: "12px 16px",
        background: "#1a1a1a",
        borderRadius: "8px",
        border: "1px solid #333",
      }}
    >
      <div
        style={{
          fontSize: "13px",
          fontWeight: 600,
          color: "#e0e0e0",
          marginBottom: "8px",
        }}
      >
        X Watchdog Pipeline
      </div>
      <p style={{ ...styles.placeholder, margin: 0 }}>
        Pipeline summary widget — coming in Phase 2.
      </p>
    </div>
  );
}

// ---------- WatchdogSettings — settings page slot ----------

export function WatchdogSettings({ context }: PluginSettingsPageProps) {
  return (
    <div style={styles.container}>
      <div>
        <h2 style={{ fontSize: "18px", fontWeight: 700, color: "#e0e0e0", margin: 0 }}>
          X Watchdog Settings
        </h2>
        <p style={{ color: "#666", fontSize: "13px", marginTop: "4px" }}>
          Configure API keys, OAuth accounts, outreach rules, and notification
          channels.
        </p>
      </div>

      <div style={styles.section}>
        <div style={styles.sectionTitle}>API Credentials</div>
        <p style={styles.placeholder}>
          Configure X Bearer Token, OpenAI API key, TwitterAPI.io key, and X
          OAuth 2.0 client credentials via the instance config form above.
          Secret refs are resolved securely at runtime.
        </p>
      </div>

      <div style={styles.section}>
        <div style={styles.sectionTitle}>Connected X Accounts</div>
        <p style={styles.placeholder}>
          OAuth 2.0 account connections (for DM access) coming in Phase 2.
          Accounts connect via the OAuth callback webhook.
        </p>
      </div>

      <div style={styles.section}>
        <div style={styles.sectionTitle}>Outreach Rules</div>
        <p style={styles.placeholder}>
          Per-project outreach templates, follow-up schedules, and channel
          routing configuration coming in Phase 2.
        </p>
      </div>

      <div style={styles.section}>
        <div style={styles.sectionTitle}>Notification Channels</div>
        <p style={styles.placeholder}>
          Discord channel routing for BD pipeline, approvals, and errors
          configured via instance config above.
        </p>
      </div>

      <div
        style={{
          ...styles.section,
          background: "#111",
          border: "1px solid #2a2a2a",
        }}
      >
        <div style={{ color: "#555", fontSize: "12px" }}>
          <span style={styles.badge}>Phase 1</span>
          <span style={{ marginLeft: "8px" }}>
            Full settings UI arrives in Phase 2 alongside business logic.
          </span>
        </div>
      </div>
    </div>
  );
}
