import { ScoreBadge } from "./score-badge.js";

const statusColors: Record<string, { bg: string; fg: string }> = {
  new: { bg: "#1e3a5f", fg: "#3b82f6" },
  reviewing: { bg: "#1e3a5f", fg: "#3b82f6" },
  contacted: { bg: "#422006", fg: "#f59e0b" },
  tg_detected: { bg: "#2e1065", fg: "#8b5cf6" },
  invited: { bg: "#042f2e", fg: "#06b6d4" },
  converted: { bg: "#14532d", fg: "#22c55e" },
  cold: { bg: "#1f1f1f", fg: "#6b7280" },
  skipped: { bg: "#1f1f1f", fg: "#6b7280" },
  snoozed: { bg: "#1f1f1f", fg: "#6b7280" },
  rejected: { bg: "#450a0a", fg: "#ef4444" },
  sent: { bg: "#422006", fg: "#f59e0b" },
};

function fmtDate(v: string | number | null | undefined): string {
  if (!v) return "--";
  const d = typeof v === "number" ? new Date(v * 1000) : new Date(v);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

interface LeadItem {
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
}

export function LeadRow({
  lead,
  projectName,
  onUpdateStatus,
}: {
  lead: LeadItem;
  projectName?: string;
  onUpdateStatus?: (id: string, status: string) => void;
}) {
  const sc = statusColors[lead.status] ?? statusColors.new;

  const cellStyle = {
    padding: "8px 12px",
    fontSize: "13px",
    color: "#ccc",
    borderBottom: "1px solid #222",
    whiteSpace: "nowrap" as const,
    overflow: "hidden" as const,
    textOverflow: "ellipsis" as const,
  };

  return (
    <tr>
      <td style={cellStyle}>
        <span style={{ color: "#e0e0e0", fontWeight: 500 }}>@{lead.handle}</span>
      </td>
      <td style={cellStyle}>
        <span
          style={{
            background: sc.bg,
            color: sc.fg,
            borderRadius: "4px",
            padding: "2px 8px",
            fontSize: "11px",
            fontWeight: 600,
          }}
        >
          {lead.status}
        </span>
      </td>
      <td style={cellStyle}>
        {lead.urgency && (
          <span
            style={{
              background: lead.urgency === "hot" ? "#450a0a" : lead.urgency === "warm" ? "#422006" : "#1f1f1f",
              color: lead.urgency === "hot" ? "#ef4444" : lead.urgency === "warm" ? "#f59e0b" : "#6b7280",
              borderRadius: "4px",
              padding: "2px 6px",
              fontSize: "11px",
              fontWeight: 500,
            }}
          >
            {lead.urgency}
          </span>
        )}
      </td>
      <td style={cellStyle}>{projectName ?? lead.projectId ?? "--"}</td>
      <td style={cellStyle}>
        {lead.signalType && (
          <span style={{ color: "#888", fontSize: "11px" }}>{lead.signalType}</span>
        )}
      </td>
      <td style={cellStyle}>{fmtDate(lead.createdAt)}</td>
      <td style={cellStyle}>
        {lead.detectedTgHandle && (
          <span
            style={{
              background: "#2e1065",
              color: "#8b5cf6",
              borderRadius: "4px",
              padding: "2px 6px",
              fontSize: "11px",
            }}
          >
            {lead.detectedTgHandle}
          </span>
        )}
      </td>
      <td style={{ ...cellStyle, display: "flex", gap: "4px" }}>
        {onUpdateStatus && lead.status === "new" && (
          <button
            onClick={() => onUpdateStatus(lead.id, "reviewing")}
            style={{
              background: "#1e3a5f",
              color: "#60a5fa",
              border: "none",
              borderRadius: "4px",
              padding: "3px 8px",
              fontSize: "11px",
              cursor: "pointer",
            }}
          >
            Review
          </button>
        )}
        {onUpdateStatus && ["new", "reviewing"].includes(lead.status) && (
          <button
            onClick={() => onUpdateStatus(lead.id, "skipped")}
            style={{
              background: "#1f1f1f",
              color: "#666",
              border: "1px solid #333",
              borderRadius: "4px",
              padding: "3px 8px",
              fontSize: "11px",
              cursor: "pointer",
            }}
          >
            Skip
          </button>
        )}
      </td>
    </tr>
  );
}
