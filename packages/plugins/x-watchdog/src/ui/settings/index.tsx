import { useState, useEffect, type CSSProperties, type ReactNode } from "react";
import { usePluginData, usePluginAction, usePluginToast } from "@paperclipai/plugin-sdk/ui";
import type { PluginSettingsPageProps } from "@paperclipai/plugin-sdk/ui";

// -- Theme-aware styles (matches Kitchen Sink / Paperclip design system) --

const card: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: "12px",
  padding: "14px",
  background: "var(--card, transparent)",
  display: "grid",
  gap: "12px",
};

const eyebrow: CSSProperties = {
  fontSize: "11px",
  opacity: 0.65,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};

const label: CSSProperties = {
  fontSize: "12px",
  opacity: 0.72,
  display: "block",
  marginBottom: "4px",
};

const input: CSSProperties = {
  width: "100%",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  padding: "8px 10px",
  background: "transparent",
  color: "inherit",
  fontSize: "12px",
  boxSizing: "border-box",
};

const btn: CSSProperties = {
  appearance: "none",
  border: "1px solid var(--border)",
  borderRadius: "999px",
  background: "transparent",
  color: "inherit",
  padding: "6px 14px",
  fontSize: "12px",
  cursor: "pointer",
};

const primaryBtn: CSSProperties = {
  ...btn,
  background: "var(--foreground)",
  color: "var(--background)",
  borderColor: "var(--foreground)",
};

const successBtn: CSSProperties = {
  ...btn,
  background: "color-mix(in srgb, #16a34a 18%, transparent)",
  borderColor: "color-mix(in srgb, #16a34a 60%, var(--border))",
  color: "#86efac",
};

const warnBtn: CSSProperties = {
  ...btn,
  background: "color-mix(in srgb, #d97706 18%, transparent)",
  borderColor: "color-mix(in srgb, #d97706 60%, var(--border))",
  color: "#fcd34d",
};

const row: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "8px",
};

const gridCols2: CSSProperties = {
  display: "grid",
  gap: "12px",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
};

const muted: CSSProperties = { fontSize: "12px", opacity: 0.72, lineHeight: 1.45 };

const toggle = (on: boolean): CSSProperties => ({
  width: "36px",
  height: "20px",
  borderRadius: "10px",
  background: on
    ? "color-mix(in srgb, #2563eb 50%, transparent)"
    : "color-mix(in srgb, var(--border) 80%, transparent)",
  position: "relative",
  cursor: "pointer",
  transition: "background 0.2s",
  flexShrink: 0,
});

const toggleKnob = (on: boolean): CSSProperties => ({
  width: "16px",
  height: "16px",
  borderRadius: "50%",
  background: on ? "#93c5fd" : "var(--foreground)",
  opacity: on ? 1 : 0.4,
  position: "absolute",
  top: "2px",
  left: on ? "18px" : "2px",
  transition: "left 0.2s, background 0.2s, opacity 0.2s",
});

const pill: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  borderRadius: "999px",
  border: "1px solid var(--border)",
  padding: "2px 8px",
  fontSize: "11px",
};

function Section({ title, tag, action, children }: {
  title: string;
  tag?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section style={card}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
        <div style={row}>
          <strong>{title}</strong>
          {tag && <span style={pill}>{tag}</span>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

// -- Component --

export function WatchdogSettings({ context }: PluginSettingsPageProps) {
  const { data: projectsData } = usePluginData<{ data: Array<{ id: string; name: string }> }>("projects");
  const { data: configData } = usePluginData<{ data: Record<string, unknown> }>("plugin-config");
  const updateProject = usePluginAction("update-project");
  const updateConfig = usePluginAction("update-config");
  const triggerJob = usePluginAction("trigger-job");
  const toast = usePluginToast();

  const savedConfig = (configData?.data ?? {}) as Record<string, unknown>;
  const discordChannels = (savedConfig.discordChannels ?? {}) as Record<string, string>;

  const [threshold, setThreshold] = useState(5);
  const [followUpHours, setFollowUpHours] = useState(48);
  const [maxFollowUps, setMaxFollowUps] = useState(3);
  const [tgEnabled, setTgEnabled] = useState(false);
  const [saving, setSaving] = useState(false);

  const [discord, setDiscord] = useState({
    bdPipeline: "", approvals: "", errors: "",
    ceoDecisions: "", dailyDigest: "", tgPartnersForum: "",
  });

  useEffect(() => {
    if (!configData) return;
    setThreshold(Number(savedConfig.notificationThreshold ?? 5));
    setFollowUpHours(Number(savedConfig.followUpWaitHours ?? 48));
    setMaxFollowUps(Number(savedConfig.maxFollowUps ?? 3));
    setTgEnabled(savedConfig.tgSyncEnabled === true);
    setDiscord({
      bdPipeline: discordChannels.bdPipeline ?? "",
      approvals: discordChannels.approvals ?? "",
      errors: discordChannels.errors ?? "",
      ceoDecisions: discordChannels.ceoDecisions ?? "",
      dailyDigest: discordChannels.dailyDigest ?? "",
      tgPartnersForum: discordChannels.tgPartnersForum ?? "",
    });
  }, [configData]);

  const projects = projectsData?.data ?? [];

  async function handleSave() {
    setSaving(true);
    try {
      for (const p of projects) {
        await updateProject({ id: p.id, bdPriorityThreshold: threshold });
      }
      await updateConfig({
        discordChannels: {
          bdPipeline: discord.bdPipeline || undefined,
          approvals: discord.approvals || undefined,
          errors: discord.errors || undefined,
          ceoDecisions: discord.ceoDecisions || undefined,
          dailyDigest: discord.dailyDigest || undefined,
          tgPartnersForum: discord.tgPartnersForum || undefined,
        },
        notificationThreshold: threshold,
        maxFollowUps,
        followUpWaitHours: followUpHours,
        tgSyncEnabled: tgEnabled,
      });
      toast({ title: "Settings saved", body: "All configuration updated successfully.", tone: "success" });
    } catch (e) {
      toast({ title: "Save failed", body: String(e), tone: "error" });
    }
    setSaving(false);
  }

  return (
    <div style={{ display: "grid", gap: "14px" }}>
      {/* Top 2-col: API Creds + OAuth */}
      <div style={gridCols2}>
        <Section title="API Credentials" tag="secrets">
          <div style={muted}>
            Managed via Paperclip instance secrets. Configure in the instance config form.
          </div>
          <div style={{ display: "grid", gap: "4px", fontSize: "12px" }}>
            {[
              ["X_BEARER_TOKEN", "X API v2 read access"],
              ["OPENAI_API_KEY", "GPT-based lead scoring"],
              ["TWITTERAPIIO_API_KEY", "Profile enrichment"],
              ["RAPIDAPI_KEY", "X profile data"],
              ["MINIMAX_API_KEY", "MiniMax AI"],
            ].map(([name, desc]) => (
              <div key={name} style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
                <span style={{ fontFamily: "monospace", fontSize: "11px" }}>{name}</span>
                <span style={{ ...muted, textAlign: "right" }}>{desc}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section
          title="Connected X Accounts"
          tag="OAuth 2.0"
          action={
            <button style={successBtn} onClick={() => triggerJob({ job: "oauth-init" })}>
              Connect Account
            </button>
          }
        >
          <div style={muted}>
            OAuth 2.0 for DM access and write operations. Connect via the callback webhook.
          </div>
        </Section>
      </div>

      {/* Outreach Rules */}
      <Section title="Outreach Rules" tag="scoring">
        <div>
          <span style={label}>
            BD Priority Threshold: <strong style={{ opacity: 1 }}>{threshold}</strong>
          </span>
          <input
            type="range" min={1} max={10} value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            style={{ width: "100%", accentColor: "#3b82f6" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", ...muted }}>
            <span>1 (all leads)</span>
            <span>10 (only top)</span>
          </div>
        </div>
        <div style={gridCols2}>
          <div>
            <span style={label}>Follow-up wait (hours)</span>
            <input type="number" value={followUpHours}
              onChange={(e) => setFollowUpHours(Number(e.target.value))} style={input} />
          </div>
          <div>
            <span style={label}>Max follow-ups</span>
            <input type="number" value={maxFollowUps}
              onChange={(e) => setMaxFollowUps(Number(e.target.value))} style={input} />
          </div>
        </div>
      </Section>

      {/* Discord — 2-col grid of channel inputs */}
      <Section title="Discord Notifications" tag="channels">
        <div style={muted}>
          Route notifications to specific Discord channels. Paste channel IDs from Discord.
        </div>
        <div style={gridCols2}>
          {([
            ["bdPipeline", "BD Pipeline", "Scores, leads, conversions"],
            ["approvals", "Approvals", "Outreach approval requests"],
            ["errors", "Errors", "Agent errors, API failures"],
            ["ceoDecisions", "CEO Decisions", "Strategic proposals"],
            ["dailyDigest", "Daily Digest", "Pipeline statistics"],
            ["tgPartnersForum", "TG Partners Forum", "Telegram mirrors"],
          ] as const).map(([key, lbl, desc]) => (
            <div key={key}>
              <span style={label}>{lbl}</span>
              <input style={input} placeholder={desc}
                value={discord[key]}
                onChange={(e) => setDiscord((prev) => ({ ...prev, [key]: e.target.value }))} />
            </div>
          ))}
        </div>
      </Section>

      {/* TG Integration */}
      <Section
        title="Telegram Integration"
        tag="sync"
        action={
          <div style={toggle(tgEnabled)} onClick={() => setTgEnabled(!tgEnabled)}>
            <div style={toggleKnob(tgEnabled)} />
          </div>
        }
      >
        <div style={muted}>
          {tgEnabled
            ? "Bot notifications and group sync enabled. Bot must have access to target groups."
            : "Disabled. Enable to sync group messages and detect lead conversions."}
        </div>
        {tgEnabled && (
          <button style={warnBtn} onClick={() => triggerJob({ job: "tg-group-sync" })}>
            Sync TG Groups Now
          </button>
        )}
      </Section>

      {/* Projects */}
      {projects.length > 0 && (
        <Section title="Projects" tag={`${projects.length}`}>
          <div style={muted}>
            Each project can override global outreach rules.
          </div>
          <div style={{ display: "grid", gap: "6px" }}>
            {projects.map((p) => (
              <div key={p.id} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "8px 12px", borderRadius: "8px",
                border: "1px solid color-mix(in srgb, var(--border) 75%, transparent)",
                fontSize: "12px",
              }}>
                <span>{p.name}</span>
                <span style={{ fontFamily: "monospace", fontSize: "11px", opacity: 0.5 }}>{p.id.slice(0, 8)}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Save */}
      <div style={row}>
        <button style={saving ? { ...btn, opacity: 0.5, cursor: "not-allowed" } : primaryBtn}
          disabled={saving} onClick={handleSave}>
          {saving ? "Saving…" : "Save Settings"}
        </button>
      </div>
    </div>
  );
}
