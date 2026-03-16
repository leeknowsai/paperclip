import { useState } from "react";
import { usePluginData, usePluginAction } from "@paperclipai/plugin-sdk/ui";
import type { PluginSettingsPageProps } from "@paperclipai/plugin-sdk/ui";

const s = {
  container: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "24px",
    padding: "16px",
    maxWidth: "720px",
    color: "#e0e0e0",
  },
  section: {
    background: "#1a1a1a",
    border: "1px solid #333",
    borderRadius: "8px",
    padding: "16px",
    display: "flex",
    flexDirection: "column" as const,
    gap: "12px",
  },
  title: { fontSize: "14px", fontWeight: 600, color: "#e0e0e0" },
  label: { fontSize: "12px", color: "#888", marginBottom: "4px", display: "block" as const },
  input: {
    width: "100%",
    background: "#111",
    border: "1px solid #333",
    borderRadius: "6px",
    padding: "6px 10px",
    color: "#e0e0e0",
    fontSize: "13px",
    outline: "none",
    boxSizing: "border-box" as const,
  },
  note: { color: "#555", fontSize: "11px" },
  btn: {
    background: "#1e3a5f",
    color: "#60a5fa",
    border: "none",
    borderRadius: "6px",
    padding: "6px 14px",
    fontSize: "13px",
    fontWeight: 500,
    cursor: "pointer" as const,
    alignSelf: "flex-start" as const,
  },
  btnDisabled: {
    background: "#1a1a1a",
    color: "#555",
    border: "1px solid #333",
    borderRadius: "6px",
    padding: "6px 14px",
    fontSize: "13px",
    cursor: "not-allowed" as const,
    alignSelf: "flex-start" as const,
  },
  row: { display: "flex", gap: "12px", alignItems: "flex-end" as const },
  toggle: (on: boolean) => ({
    width: "36px",
    height: "20px",
    borderRadius: "10px",
    background: on ? "#1e3a5f" : "#333",
    position: "relative" as const,
    cursor: "pointer" as const,
    transition: "background 0.2s",
    flexShrink: 0,
  }),
  toggleKnob: (on: boolean) => ({
    width: "16px",
    height: "16px",
    borderRadius: "50%",
    background: on ? "#60a5fa" : "#666",
    position: "absolute" as const,
    top: "2px",
    left: on ? "18px" : "2px",
    transition: "left 0.2s, background 0.2s",
  }),
};

export function WatchdogSettings({ context }: PluginSettingsPageProps) {
  const { data: projectsData } = usePluginData<{ data: Array<{ id: string; name: string }> }>("projects");
  const updateProject = usePluginAction("update-project");
  const triggerJob = usePluginAction("trigger-job");

  // Outreach rules form state
  const [threshold, setThreshold] = useState(5);
  const [followUpHours, setFollowUpHours] = useState(48);
  const [maxFollowUps, setMaxFollowUps] = useState(3);

  // TG integration
  const [tgEnabled, setTgEnabled] = useState(true);

  // Saving state
  const [saving, setSaving] = useState(false);

  const projects = projectsData?.data ?? [];

  return (
    <div style={s.container}>
      <div>
        <h2 style={{ fontSize: "18px", fontWeight: 700, color: "#e0e0e0", margin: 0 }}>
          X Watchdog Settings
        </h2>
        <p style={{ color: "#666", fontSize: "13px", marginTop: "4px" }}>
          Configure API connections, outreach rules, and notification channels.
        </p>
      </div>

      {/* API Keys */}
      <div style={s.section}>
        <div style={s.title}>API Credentials</div>
        <div style={s.note}>
          API keys are managed via Paperclip instance secrets. Configure these in the instance config form:
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "12px", color: "#888" }}>
          <div>X_BEARER_TOKEN &mdash; X API v2 bearer token for read access</div>
          <div>X_CLIENT_ID / X_CLIENT_SECRET &mdash; OAuth 2.0 for DM and write access</div>
          <div>OPENAI_API_KEY &mdash; GPT-based lead scoring</div>
          <div>TG_BOT_TOKEN &mdash; Telegram bot for notifications and group sync</div>
          <div>TWITTERAPIIO_API_KEY &mdash; Profile enrichment via TwitterAPI.io</div>
        </div>
        <div style={s.note}>Secret refs are resolved securely at runtime by the plugin SDK.</div>
      </div>

      {/* Connected X Accounts */}
      <div style={s.section}>
        <div style={s.title}>Connected X Accounts</div>
        <div style={s.note}>
          OAuth 2.0 accounts for DM access and write operations. Connect accounts via the OAuth callback webhook.
        </div>
        <button
          style={s.btn}
          onClick={() => triggerJob({ job: "oauth-init" })}
        >
          Connect X Account
        </button>
      </div>

      {/* Outreach Rules */}
      <div style={s.section}>
        <div style={s.title}>Outreach Rules</div>

        <div>
          <label style={s.label}>
            BD Priority Threshold: <strong style={{ color: "#e0e0e0" }}>{threshold}</strong>
          </label>
          <input
            type="range"
            min={1}
            max={10}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            style={{ width: "100%", accentColor: "#3b82f6" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#555" }}>
            <span>1 (all leads)</span>
            <span>10 (only top)</span>
          </div>
        </div>

        <div style={s.row}>
          <div style={{ flex: 1 }}>
            <label style={s.label}>Follow-up wait (hours)</label>
            <input
              type="number"
              value={followUpHours}
              onChange={(e) => setFollowUpHours(Number(e.target.value))}
              style={s.input}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={s.label}>Max follow-ups</label>
            <input
              type="number"
              value={maxFollowUps}
              onChange={(e) => setMaxFollowUps(Number(e.target.value))}
              style={s.input}
            />
          </div>
        </div>
      </div>

      {/* TG Integration */}
      <div style={s.section}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={s.title}>Telegram Integration</div>
          <div style={s.toggle(tgEnabled)} onClick={() => setTgEnabled(!tgEnabled)}>
            <div style={s.toggleKnob(tgEnabled)} />
          </div>
        </div>
        <div style={s.note}>
          {tgEnabled
            ? "Telegram bot notifications and group sync are enabled. The bot must have access to target groups."
            : "Telegram integration is disabled. Enable to receive notifications and sync group messages."}
        </div>
        {tgEnabled && (
          <button style={s.btn} onClick={() => triggerJob({ job: "tg-group-sync" })}>
            Sync TG Groups Now
          </button>
        )}
      </div>

      {/* Per-project settings */}
      {projects.length > 0 && (
        <div style={s.section}>
          <div style={s.title}>Project-Level Settings</div>
          <div style={s.note}>
            Each project can override global outreach rules. Click a project to configure its BD threshold, scoring prompt, and outreach templates.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {projects.map((p) => (
              <div
                key={p.id}
                style={{
                  background: "#111",
                  borderRadius: "6px",
                  padding: "8px 12px",
                  fontSize: "13px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span>{p.name}</span>
                <span style={{ color: "#555", fontSize: "11px" }}>{p.id.slice(0, 8)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Save (placeholder — settings would persist via updateProject per-project or a global config handler) */}
      <button
        style={saving ? s.btnDisabled : s.btn}
        disabled={saving}
        onClick={async () => {
          setSaving(true);
          // Save global-level outreach rules to each project
          for (const p of projects) {
            await updateProject({ id: p.id, bdPriorityThreshold: threshold });
          }
          setSaving(false);
        }}
      >
        {saving ? "Saving..." : "Save Settings"}
      </button>
    </div>
  );
}
