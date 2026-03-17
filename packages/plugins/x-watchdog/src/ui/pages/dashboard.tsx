import { useState, type CSSProperties, type ReactNode } from "react";
import { usePluginData, usePluginAction } from "@paperclipai/plugin-sdk/ui";
import type { PluginPageProps } from "@paperclipai/plugin-sdk/ui";
import { TweetCard } from "../components/tweet-card.js";
import { LeadRow } from "../components/lead-row.js";

type Tab = "projects" | "leads" | "feed" | "dms" | "insights";

const tabDefs: { key: Tab; label: string }[] = [
  { key: "projects", label: "Projects" },
  { key: "leads", label: "Leads" },
  { key: "feed", label: "Feed" },
  { key: "dms", label: "DMs" },
  { key: "insights", label: "Insights" },
];

// -- Theme-aware styles --

const card: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: "12px",
  padding: "14px",
  background: "var(--card, transparent)",
};

const subtleCard: CSSProperties = {
  border: "1px solid color-mix(in srgb, var(--border) 75%, transparent)",
  borderRadius: "10px",
  padding: "12px",
};

const widgetGrid: CSSProperties = {
  display: "grid",
  gap: "12px",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
};

const widget: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: "14px",
  padding: "14px",
  display: "grid",
  gap: "6px",
  background: "color-mix(in srgb, var(--card, transparent) 72%, transparent)",
};

const eyebrow: CSSProperties = {
  fontSize: "11px",
  opacity: 0.65,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};

const muted: CSSProperties = { fontSize: "12px", opacity: 0.72, lineHeight: 1.45 };

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
  background: "color-mix(in srgb, #2563eb 18%, transparent)",
  borderColor: "color-mix(in srgb, #2563eb 60%, var(--border))",
  color: "#93c5fd",
};

const ghostBtn: CSSProperties = { ...btn };

const pill: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  borderRadius: "999px",
  border: "1px solid var(--border)",
  padding: "2px 8px",
  fontSize: "11px",
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

const row: CSSProperties = { display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px" };

const tabBar: CSSProperties = {
  display: "flex",
  gap: "2px",
  borderRadius: "10px",
  border: "1px solid var(--border)",
  padding: "3px",
  background: "color-mix(in srgb, var(--card, transparent) 50%, transparent)",
};

function tabStyle(active: boolean): CSSProperties {
  return {
    padding: "6px 16px",
    borderRadius: "8px",
    fontSize: "12px",
    fontWeight: active ? 600 : 400,
    opacity: active ? 1 : 0.6,
    background: active ? "var(--card, transparent)" : "transparent",
    border: active ? "1px solid var(--border)" : "1px solid transparent",
    cursor: "pointer",
    color: "inherit",
  };
}

function KpiWidget({ eyebrow: label, value, sub }: { eyebrow: string; value: string | number; sub?: string }) {
  return (
    <div style={widget}>
      <div style={eyebrow}>{label}</div>
      <strong style={{ fontSize: "22px" }}>{value}</strong>
      {sub && <div style={muted}>{sub}</div>}
    </div>
  );
}

function Section({ title, tag, action, children }: {
  title: string; tag?: string; action?: ReactNode; children: ReactNode;
}) {
  return (
    <section style={{ ...card, display: "grid", gap: "12px" }}>
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

// --------------- KPI Summary ---------------

function KpiSummary() {
  const { data: projectsData } = usePluginData<{ data: Array<unknown> }>("projects");
  const { data: leadsData } = usePluginData<{ leads: Array<unknown>; total: number }>("leads");
  const { data: feedData } = usePluginData<{ data: Array<unknown> }>("feeds", { limit: 1 });
  const { data: dmsData } = usePluginData<{ data: Array<unknown>; total: number }>("dm-conversations");

  return (
    <div style={widgetGrid}>
      <KpiWidget eyebrow="Projects" value={projectsData?.data?.length ?? 0} />
      <KpiWidget eyebrow="Total Leads" value={leadsData?.total ?? 0} />
      <KpiWidget eyebrow="Tweets Scored" value={feedData?.data?.length ?? 0} />
      <KpiWidget eyebrow="DM Threads" value={dmsData?.total ?? 0} />
    </div>
  );
}

// --------------- Projects Tab ---------------

function ProjectsTab() {
  const { data, loading, error } = usePluginData<{
    data: Array<{
      id: string; name: string; handleCount: number;
      active: boolean; bdPriorityThreshold: number | null; speedTier: string | null;
    }>;
  }>("projects");
  const createProject = usePluginAction("create-project");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  if (loading) return <div style={muted}>Loading projects…</div>;
  if (error) return <div style={{ color: "var(--destructive, #c00)", fontSize: "12px" }}>Error loading projects</div>;

  const projects = data?.data ?? [];

  return (
    <div style={{ display: "grid", gap: "12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={row}>
          <strong>{projects.length} project{projects.length !== 1 ? "s" : ""}</strong>
        </div>
        {!creating && <button style={primaryBtn} onClick={() => setCreating(true)}>+ Add Project</button>}
      </div>

      {creating && (
        <div style={{ ...subtleCard, display: "flex", gap: "8px", alignItems: "center" }}>
          <input value={newName} onChange={(e) => setNewName(e.target.value)}
            placeholder="Project name" style={{ ...input, flex: 1 }} />
          <button style={primaryBtn} onClick={async () => {
            if (!newName.trim()) return;
            await createProject({ name: newName.trim() });
            setNewName(""); setCreating(false);
          }}>Create</button>
          <button style={ghostBtn} onClick={() => { setCreating(false); setNewName(""); }}>Cancel</button>
        </div>
      )}

      {projects.length === 0 && <div style={{ ...muted, textAlign: "center", padding: "24px" }}>No projects yet.</div>}

      {projects.map((p) => (
        <div key={p.id} style={{ ...subtleCard, cursor: "pointer" }}
          onClick={() => setExpanded(expanded === p.id ? null : p.id)}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={row}>
              <strong style={{ fontSize: "13px" }}>{p.name}</strong>
              {!p.active && <span style={pill}>inactive</span>}
            </div>
            <div style={{ ...row, gap: "8px" }}>
              <span style={pill}>{p.handleCount} handles</span>
              {p.speedTier && <span style={{ ...pill, opacity: 0.6 }}>{p.speedTier}</span>}
              <span style={{ opacity: 0.4, fontSize: "11px" }}>{expanded === p.id ? "▲" : "▼"}</span>
            </div>
          </div>
          {expanded === p.id && <ProjectDetail projectId={p.id} />}
        </div>
      ))}
    </div>
  );
}

function ProjectDetail({ projectId }: { projectId: string }) {
  const { data, loading } = usePluginData<{
    data: {
      id: string; name: string; handleCount: number;
      bdPriorityThreshold: number | null; scoringPrompt: string | null;
      triggerKeywords: string | null; outreachChannels: string | null; tgGroupId: string | null;
    };
  }>("project-detail", { id: projectId });

  if (loading) return <div style={muted}>Loading…</div>;
  if (!data?.data) return null;

  const p = data.data;
  let keywords: string[] = [];
  try { keywords = p.triggerKeywords ? JSON.parse(p.triggerKeywords) : []; } catch { /* skip */ }
  let channels: string[] = [];
  try { channels = p.outreachChannels ? JSON.parse(p.outreachChannels) : []; } catch { /* skip */ }

  return (
    <div style={{
      marginTop: "10px", paddingTop: "10px",
      borderTop: "1px solid color-mix(in srgb, var(--border) 50%, transparent)",
      display: "grid", gap: "6px", fontSize: "12px",
    }} onClick={(e) => e.stopPropagation()}>
      <div style={row}>
        <span style={eyebrow}>BD threshold</span>
        <span>{p.bdPriorityThreshold ?? "--"}</span>
      </div>
      <div style={row}>
        <span style={eyebrow}>TG Group</span>
        <span>{p.tgGroupId ?? "not set"}</span>
      </div>
      {keywords.length > 0 && (
        <div style={row}>
          <span style={eyebrow}>Keywords</span>
          {keywords.map((k) => <span key={k} style={pill}>{k}</span>)}
        </div>
      )}
      {channels.length > 0 && (
        <div style={row}>
          <span style={eyebrow}>Channels</span>
          <span>{channels.join(", ")}</span>
        </div>
      )}
      {p.scoringPrompt && (
        <div style={{ ...muted, marginTop: "4px" }}>
          Scoring: {p.scoringPrompt.slice(0, 120)}{p.scoringPrompt.length > 120 ? "…" : ""}
        </div>
      )}
    </div>
  );
}

// --------------- Leads Tab ---------------

function LeadsTab() {
  const [statusFilter, setStatusFilter] = useState<string>("");
  const { data, loading, error, refresh } = usePluginData<{
    leads: Array<{
      id: string; handle: string; status: string; urgency: string | null;
      projectId: string | null; tweetId: string; signalType: string | null;
      createdAt: string | number | null; updatedAt: string | number | null;
      detectedTgHandle: string | null;
    }>; total: number; page: number; totalPages: number;
  }>("leads", statusFilter ? { status: statusFilter } : {});

  const updateLead = usePluginAction("update-lead");
  const handleUpdateStatus = async (id: string, status: string) => {
    await updateLead({ id, status }); refresh();
  };

  const statuses = ["", "new", "reviewing", "contacted", "sent", "tg_detected", "invited", "converted", "skipped", "snoozed", "rejected"];

  if (loading) return <div style={muted}>Loading leads…</div>;
  if (error) return <div style={{ color: "var(--destructive, #c00)", fontSize: "12px" }}>Error loading leads</div>;

  const leads = data?.leads ?? [];

  return (
    <div style={{ display: "grid", gap: "12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
        <strong>{data?.total ?? 0} leads</strong>
        <div style={{ ...row, gap: "4px" }}>
          {statuses.map((st) => (
            <button key={st || "__all"} onClick={() => setStatusFilter(st)}
              style={{
                ...btn, padding: "3px 10px", fontSize: "11px",
                opacity: statusFilter === st ? 1 : 0.5,
                background: statusFilter === st
                  ? "color-mix(in srgb, var(--foreground) 10%, transparent)" : "transparent",
                borderColor: statusFilter === st ? "var(--foreground)" : "var(--border)",
              }}>
              {st || "All"}
            </button>
          ))}
        </div>
      </div>

      {leads.length === 0 ? (
        <div style={{ ...muted, textAlign: "center", padding: "24px" }}>
          No leads{statusFilter ? ` with status "${statusFilter}"` : ""}.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
            <thead>
              <tr>
                {["Handle", "Status", "Urgency", "Project", "Signal", "Created", "TG", "Actions"].map((h) => (
                  <th key={h} style={{
                    textAlign: "left", padding: "6px 12px", fontSize: "11px",
                    fontWeight: 500, opacity: 0.5,
                    borderBottom: "1px solid var(--border)", whiteSpace: "nowrap",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <LeadRow key={lead.id} lead={lead} onUpdateStatus={handleUpdateStatus} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// --------------- Feed Tab ---------------

function FeedTab() {
  const { data, loading, error } = usePluginData<{
    data: Array<{
      id: string; content: string | null; createdAt: string | number | null;
      aiScore: number | null; aiSummary: string | null;
      username: string | null; displayName: string | null; category: string | null;
    }>; page: number; limit: number;
  }>("feeds", { limit: 30 });

  if (loading) return <div style={muted}>Loading feed…</div>;
  if (error) return <div style={{ color: "var(--destructive, #c00)", fontSize: "12px" }}>Error loading feed</div>;

  const tweets = data?.data ?? [];

  return (
    <div style={{ display: "grid", gap: "8px" }}>
      <strong>{tweets.length} recent tweets</strong>
      {tweets.length === 0 && <div style={{ ...muted, textAlign: "center", padding: "24px" }}>No tweets in feed yet.</div>}
      {tweets.map((t) => <TweetCard key={t.id} tweet={t} />)}
    </div>
  );
}

// --------------- DMs Tab ---------------

function DMsTab() {
  const { data, loading, error } = usePluginData<{
    data: Array<{
      id: string; accountUsername: string; participantUsernames: string | null;
      lastDmAt: string | null; lastDmPreview: string | null;
      detectedTgHandles: string | null; projectId: string | null;
    }>; total: number;
  }>("dm-conversations");

  if (loading) return <div style={muted}>Loading DMs…</div>;
  if (error) return <div style={{ color: "var(--destructive, #c00)", fontSize: "12px" }}>Error loading DMs</div>;

  const convos = data?.data ?? [];

  return (
    <div style={{ display: "grid", gap: "8px" }}>
      <strong>{data?.total ?? 0} conversations</strong>
      {convos.length === 0 && <div style={{ ...muted, textAlign: "center", padding: "24px" }}>No DM conversations synced yet.</div>}
      {convos.map((c) => {
        let participants: string[] = [];
        try { participants = c.participantUsernames ? JSON.parse(c.participantUsernames) : []; } catch { /* skip */ }
        let tgHandles: string[] = [];
        try { tgHandles = c.detectedTgHandles ? JSON.parse(c.detectedTgHandles) : []; } catch { /* skip */ }

        return (
          <div key={c.id} style={subtleCard}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
              <div style={row}>
                <strong style={{ fontSize: "12px" }}>
                  {participants.length > 0 ? participants.map((p) => `@${p}`).join(", ") : c.accountUsername}
                </strong>
                {tgHandles.map((h) => (
                  <span key={h} style={{
                    ...pill,
                    background: "color-mix(in srgb, #7c3aed 18%, transparent)",
                    borderColor: "color-mix(in srgb, #7c3aed 60%, var(--border))",
                    color: "#c4b5fd",
                  }}>TG: {h}</span>
                ))}
              </div>
              <span style={{ ...muted, whiteSpace: "nowrap" }}>
                {c.lastDmAt ? new Date(c.lastDmAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}
              </span>
            </div>
            {c.lastDmPreview && (
              <div style={{ ...muted, marginTop: "6px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {c.lastDmPreview}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// --------------- Insights Tab ---------------

function InsightsTab() {
  return (
    <Section title="Insights" tag="beta">
      <div style={muted}>
        Outreach retrospectives, conversion funnel analysis, and pipeline health metrics will appear here.
      </div>
    </Section>
  );
}

// --------------- Main Dashboard ---------------

export function WatchdogDashboard({ context }: PluginPageProps) {
  const [tab, setTab] = useState<Tab>("projects");
  const Content = { projects: ProjectsTab, leads: LeadsTab, feed: FeedTab, dms: DMsTab, insights: InsightsTab }[tab];

  return (
    <div style={{ display: "grid", gap: "14px" }}>
      {/* KPI Summary */}
      <KpiSummary />

      {/* Tab bar */}
      <div style={tabBar}>
        {tabDefs.map((t) => (
          <button key={t.key} style={tabStyle(tab === t.key)} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <Content />
    </div>
  );
}
