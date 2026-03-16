import { useState } from "react";
import { usePluginData, usePluginAction } from "@paperclipai/plugin-sdk/ui";
import type { PluginPageProps } from "@paperclipai/plugin-sdk/ui";
import { TweetCard } from "../components/tweet-card.js";
import { LeadRow } from "../components/lead-row.js";
import { ScoreBadge } from "../components/score-badge.js";

type Tab = "projects" | "leads" | "feed" | "dms" | "insights";

const tabs: { key: Tab; label: string }[] = [
  { key: "projects", label: "Projects" },
  { key: "leads", label: "Leads" },
  { key: "feed", label: "Feed" },
  { key: "dms", label: "DMs" },
  { key: "insights", label: "Insights" },
];

const s = {
  page: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "16px",
    padding: "16px",
    maxWidth: "1100px",
    color: "#e0e0e0",
  },
  header: { fontSize: "20px", fontWeight: 700, color: "#e0e0e0", margin: 0 },
  subtitle: { color: "#666", fontSize: "13px", marginTop: "4px" },
  tabBar: {
    display: "flex",
    gap: "2px",
    background: "#111",
    borderRadius: "8px",
    padding: "3px",
  },
  tab: (active: boolean) => ({
    padding: "6px 16px",
    borderRadius: "6px",
    fontSize: "13px",
    fontWeight: active ? 600 : 400,
    color: active ? "#e0e0e0" : "#888",
    background: active ? "#1a1a1a" : "transparent",
    border: "none",
    cursor: "pointer" as const,
  }),
  card: {
    background: "#1a1a1a",
    border: "1px solid #333",
    borderRadius: "8px",
    padding: "16px",
  },
  empty: { color: "#555", fontSize: "13px", padding: "24px", textAlign: "center" as const },
  loading: { color: "#666", fontSize: "13px", padding: "24px", textAlign: "center" as const },
  error: { color: "#ef4444", fontSize: "13px", padding: "12px" },
  btn: {
    background: "#1e3a5f",
    color: "#60a5fa",
    border: "none",
    borderRadius: "6px",
    padding: "6px 14px",
    fontSize: "13px",
    fontWeight: 500,
    cursor: "pointer" as const,
  },
  btnGhost: {
    background: "transparent",
    color: "#888",
    border: "1px solid #333",
    borderRadius: "6px",
    padding: "6px 14px",
    fontSize: "13px",
    cursor: "pointer" as const,
  },
};

// --------------- Projects Tab ---------------

function ProjectsTab() {
  const { data, loading, error } = usePluginData<{
    data: Array<{
      id: string;
      name: string;
      handleCount: number;
      active: boolean;
      bdPriorityThreshold: number | null;
      speedTier: string | null;
    }>;
  }>("projects");
  const createProject = usePluginAction("create-project");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  if (loading) return <div style={s.loading}>Loading projects...</div>;
  if (error) return <div style={s.error}>Error loading projects</div>;

  const projects = data?.data ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: "14px", fontWeight: 600 }}>{projects.length} project{projects.length !== 1 ? "s" : ""}</span>
        {!creating && (
          <button style={s.btn} onClick={() => setCreating(true)}>+ Add Project</button>
        )}
      </div>

      {creating && (
        <div style={{ ...s.card, display: "flex", gap: "8px", alignItems: "center" }}>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Project name"
            style={{
              flex: 1,
              background: "#111",
              border: "1px solid #333",
              borderRadius: "6px",
              padding: "6px 10px",
              color: "#e0e0e0",
              fontSize: "13px",
              outline: "none",
            }}
          />
          <button
            style={s.btn}
            onClick={async () => {
              if (!newName.trim()) return;
              await createProject({ name: newName.trim() });
              setNewName("");
              setCreating(false);
            }}
          >
            Create
          </button>
          <button style={s.btnGhost} onClick={() => { setCreating(false); setNewName(""); }}>Cancel</button>
        </div>
      )}

      {projects.length === 0 && <div style={s.empty}>No projects yet. Create one to start tracking handles.</div>}

      {projects.map((p) => (
        <div
          key={p.id}
          style={{ ...s.card, cursor: "pointer" }}
          onClick={() => setExpanded(expanded === p.id ? null : p.id)}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <span style={{ fontSize: "14px", fontWeight: 600, color: "#e0e0e0" }}>{p.name}</span>
              {!p.active && (
                <span style={{ marginLeft: "8px", color: "#666", fontSize: "11px" }}>inactive</span>
              )}
            </div>
            <div style={{ display: "flex", gap: "12px", fontSize: "12px", color: "#888" }}>
              <span>{p.handleCount} handles</span>
              {p.speedTier && <span style={{ color: "#555" }}>{p.speedTier}</span>}
              <span style={{ color: "#555" }}>{expanded === p.id ? "▲" : "▼"}</span>
            </div>
          </div>

          {expanded === p.id && (
            <ProjectDetail projectId={p.id} />
          )}
        </div>
      ))}
    </div>
  );
}

function ProjectDetail({ projectId }: { projectId: string }) {
  const { data, loading } = usePluginData<{
    data: {
      id: string;
      name: string;
      handleCount: number;
      bdPriorityThreshold: number | null;
      scoringPrompt: string | null;
      triggerKeywords: string | null;
      outreachChannels: string | null;
      tgGroupId: string | null;
    };
  }>("project-detail", { id: projectId });

  if (loading) return <div style={{ ...s.loading, padding: "8px 0" }}>Loading...</div>;
  if (!data?.data) return null;

  const p = data.data;
  let keywords: string[] = [];
  try { keywords = p.triggerKeywords ? JSON.parse(p.triggerKeywords) : []; } catch { /* skip */ }
  let channels: string[] = [];
  try { channels = p.outreachChannels ? JSON.parse(p.outreachChannels) : []; } catch { /* skip */ }

  return (
    <div
      style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid #222", display: "flex", flexDirection: "column", gap: "6px", fontSize: "12px", color: "#aaa" }}
      onClick={(e) => e.stopPropagation()}
    >
      <div><span style={{ color: "#666" }}>BD threshold:</span> {p.bdPriorityThreshold ?? "--"}</div>
      <div><span style={{ color: "#666" }}>TG Group:</span> {p.tgGroupId ?? "not set"}</div>
      {keywords.length > 0 && (
        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
          <span style={{ color: "#666" }}>Keywords:</span>
          {keywords.map((k) => (
            <span key={k} style={{ background: "#1f1f1f", borderRadius: "3px", padding: "1px 6px", fontSize: "11px" }}>{k}</span>
          ))}
        </div>
      )}
      {channels.length > 0 && (
        <div><span style={{ color: "#666" }}>Channels:</span> {channels.join(", ")}</div>
      )}
      {p.scoringPrompt && (
        <div style={{ color: "#555", fontSize: "11px", marginTop: "4px" }}>
          Scoring prompt: {p.scoringPrompt.slice(0, 120)}{p.scoringPrompt.length > 120 ? "..." : ""}
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
      id: string;
      handle: string;
      status: string;
      urgency: string | null;
      projectId: string | null;
      tweetId: string;
      signalType: string | null;
      createdAt: string | number | null;
      updatedAt: string | number | null;
      detectedTgHandle: string | null;
    }>;
    total: number;
    page: number;
    totalPages: number;
  }>("leads", statusFilter ? { status: statusFilter } : {});

  const updateLead = usePluginAction("update-lead");

  const handleUpdateStatus = async (id: string, status: string) => {
    await updateLead({ id, status });
    refresh();
  };

  const statuses = ["", "new", "reviewing", "contacted", "sent", "tg_detected", "invited", "converted", "skipped", "snoozed", "rejected"];

  if (loading) return <div style={s.loading}>Loading leads...</div>;
  if (error) return <div style={s.error}>Error loading leads</div>;

  const leads = data?.leads ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: "14px", fontWeight: 600 }}>{data?.total ?? 0} leads</span>
        <div style={{ display: "flex", gap: "4px" }}>
          {statuses.map((st) => (
            <button
              key={st || "__all"}
              onClick={() => setStatusFilter(st)}
              style={{
                ...s.btnGhost,
                padding: "3px 10px",
                fontSize: "11px",
                color: statusFilter === st ? "#60a5fa" : "#888",
                borderColor: statusFilter === st ? "#1e3a5f" : "#333",
                background: statusFilter === st ? "#0f1f33" : "transparent",
              }}
            >
              {st || "All"}
            </button>
          ))}
        </div>
      </div>

      {leads.length === 0 ? (
        <div style={s.empty}>No leads{statusFilter ? ` with status "${statusFilter}"` : ""}.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr>
                {["Handle", "Status", "Urgency", "Project", "Signal", "Created", "TG", "Actions"].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: "left",
                      padding: "6px 12px",
                      fontSize: "11px",
                      color: "#666",
                      fontWeight: 500,
                      borderBottom: "1px solid #333",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
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
      id: string;
      content: string | null;
      createdAt: string | number | null;
      aiScore: number | null;
      aiSummary: string | null;
      username: string | null;
      displayName: string | null;
      category: string | null;
    }>;
    page: number;
    limit: number;
  }>("feeds", { limit: 30 });

  if (loading) return <div style={s.loading}>Loading feed...</div>;
  if (error) return <div style={s.error}>Error loading feed</div>;

  const tweets = data?.data ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <span style={{ fontSize: "14px", fontWeight: 600 }}>{tweets.length} recent tweets</span>
      {tweets.length === 0 && <div style={s.empty}>No tweets in feed yet.</div>}
      {tweets.map((t) => (
        <TweetCard key={t.id} tweet={t} />
      ))}
    </div>
  );
}

// --------------- DMs Tab ---------------

function DMsTab() {
  const { data, loading, error } = usePluginData<{
    data: Array<{
      id: string;
      accountUsername: string;
      participantUsernames: string | null;
      lastDmAt: string | null;
      lastDmPreview: string | null;
      detectedTgHandles: string | null;
      projectId: string | null;
    }>;
    total: number;
  }>("dm-conversations");

  if (loading) return <div style={s.loading}>Loading DM conversations...</div>;
  if (error) return <div style={s.error}>Error loading DMs</div>;

  const convos = data?.data ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <span style={{ fontSize: "14px", fontWeight: 600 }}>{data?.total ?? 0} conversations</span>
      {convos.length === 0 && <div style={s.empty}>No DM conversations synced yet.</div>}
      {convos.map((c) => {
        let participants: string[] = [];
        try { participants = c.participantUsernames ? JSON.parse(c.participantUsernames) : []; } catch { /* skip */ }
        let tgHandles: string[] = [];
        try { tgHandles = c.detectedTgHandles ? JSON.parse(c.detectedTgHandles) : []; } catch { /* skip */ }

        return (
          <div key={c.id} style={s.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontWeight: 600, fontSize: "13px" }}>
                  {participants.length > 0 ? participants.map((p) => `@${p}`).join(", ") : c.accountUsername}
                </span>
                {tgHandles.length > 0 && tgHandles.map((h) => (
                  <span
                    key={h}
                    style={{
                      background: "#2e1065",
                      color: "#8b5cf6",
                      borderRadius: "4px",
                      padding: "2px 6px",
                      fontSize: "11px",
                      fontWeight: 500,
                    }}
                  >
                    TG: {h}
                  </span>
                ))}
              </div>
              <span style={{ color: "#555", fontSize: "11px" }}>
                {c.lastDmAt ? new Date(c.lastDmAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}
              </span>
            </div>
            {c.lastDmPreview && (
              <div style={{ color: "#888", fontSize: "12px", marginTop: "6px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
    <div style={s.card}>
      <div style={{ fontSize: "14px", fontWeight: 600, marginBottom: "8px" }}>Insights</div>
      <div style={{ color: "#555", fontSize: "13px" }}>
        Coming soon. Outreach retrospectives, conversion funnel analysis, and pipeline health metrics will appear here.
      </div>
    </div>
  );
}

// --------------- Main Dashboard ---------------

export function WatchdogDashboard({ context }: PluginPageProps) {
  const [tab, setTab] = useState<Tab>("projects");

  const TabContent = { projects: ProjectsTab, leads: LeadsTab, feed: FeedTab, dms: DMsTab, insights: InsightsTab }[tab];

  return (
    <div style={s.page}>
      <div>
        <h1 style={s.header}>X Watchdog</h1>
        <p style={s.subtitle}>BD pipeline — monitor X accounts, score leads, and manage outreach</p>
      </div>

      <div style={s.tabBar}>
        {tabs.map((t) => (
          <button key={t.key} style={s.tab(tab === t.key)} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      <TabContent />
    </div>
  );
}
