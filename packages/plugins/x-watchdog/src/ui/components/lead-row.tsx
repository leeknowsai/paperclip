const statusTones: Record<string, { bg: string; border: string; fg: string }> = {
  new:         { bg: "color-mix(in srgb, #2563eb 18%, transparent)", border: "color-mix(in srgb, #2563eb 60%, var(--border))", fg: "#93c5fd" },
  reviewing:   { bg: "color-mix(in srgb, #2563eb 18%, transparent)", border: "color-mix(in srgb, #2563eb 60%, var(--border))", fg: "#93c5fd" },
  contacted:   { bg: "color-mix(in srgb, #d97706 18%, transparent)", border: "color-mix(in srgb, #d97706 60%, var(--border))", fg: "#fcd34d" },
  sent:        { bg: "color-mix(in srgb, #d97706 18%, transparent)", border: "color-mix(in srgb, #d97706 60%, var(--border))", fg: "#fcd34d" },
  tg_detected: { bg: "color-mix(in srgb, #7c3aed 18%, transparent)", border: "color-mix(in srgb, #7c3aed 60%, var(--border))", fg: "#c4b5fd" },
  invited:     { bg: "color-mix(in srgb, #0891b2 18%, transparent)", border: "color-mix(in srgb, #0891b2 60%, var(--border))", fg: "#67e8f9" },
  converted:   { bg: "color-mix(in srgb, #16a34a 18%, transparent)", border: "color-mix(in srgb, #16a34a 60%, var(--border))", fg: "#86efac" },
  skipped:     { bg: "transparent", border: "var(--border)", fg: "inherit" },
  snoozed:     { bg: "transparent", border: "var(--border)", fg: "inherit" },
  rejected:    { bg: "color-mix(in srgb, #dc2626 18%, transparent)", border: "color-mix(in srgb, #dc2626 60%, var(--border))", fg: "#fca5a5" },
};

const urgencyTones: Record<string, { bg: string; border: string; fg: string }> = {
  hot:  { bg: "color-mix(in srgb, #dc2626 18%, transparent)", border: "color-mix(in srgb, #dc2626 60%, var(--border))", fg: "#fca5a5" },
  warm: { bg: "color-mix(in srgb, #d97706 18%, transparent)", border: "color-mix(in srgb, #d97706 60%, var(--border))", fg: "#fcd34d" },
  cold: { bg: "transparent", border: "var(--border)", fg: "inherit" },
};

function fmtDate(v: string | number | null | undefined): string {
  if (!v) return "--";
  const d = typeof v === "number" ? new Date(v * 1000) : new Date(v);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const pillStyle = (t: { bg: string; border: string; fg: string }) => ({
  display: "inline-flex" as const,
  alignItems: "center" as const,
  borderRadius: "999px",
  border: `1px solid ${t.border}`,
  background: t.bg,
  color: t.fg,
  padding: "2px 8px",
  fontSize: "11px",
  fontWeight: 600 as const,
  whiteSpace: "nowrap" as const,
});

const btn = {
  appearance: "none" as const,
  border: "1px solid var(--border)",
  borderRadius: "999px",
  background: "transparent",
  color: "inherit",
  padding: "3px 10px",
  fontSize: "11px",
  cursor: "pointer" as const,
};

const primaryBtn = {
  ...btn,
  background: "color-mix(in srgb, #2563eb 18%, transparent)",
  borderColor: "color-mix(in srgb, #2563eb 60%, var(--border))",
  color: "#93c5fd",
};

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
  const st = statusTones[lead.status] ?? statusTones.new;
  const cell = {
    padding: "8px 12px",
    fontSize: "12px",
    borderBottom: "1px solid color-mix(in srgb, var(--border) 50%, transparent)",
    whiteSpace: "nowrap" as const,
    overflow: "hidden" as const,
    textOverflow: "ellipsis" as const,
  };

  return (
    <tr>
      <td style={cell}>
        <strong style={{ fontSize: "12px" }}>@{lead.handle}</strong>
      </td>
      <td style={cell}>
        <span style={pillStyle(st)}>{lead.status}</span>
      </td>
      <td style={cell}>
        {lead.urgency && (
          <span style={pillStyle(urgencyTones[lead.urgency] ?? urgencyTones.cold)}>
            {lead.urgency}
          </span>
        )}
      </td>
      <td style={cell}>{projectName ?? lead.projectId ?? "--"}</td>
      <td style={cell}>
        {lead.signalType && (
          <span style={{ opacity: 0.6, fontSize: "11px" }}>{lead.signalType}</span>
        )}
      </td>
      <td style={cell}>{fmtDate(lead.createdAt)}</td>
      <td style={cell}>
        {lead.detectedTgHandle && (
          <span style={pillStyle(statusTones.tg_detected)}>
            {lead.detectedTgHandle}
          </span>
        )}
      </td>
      <td style={{ ...cell, display: "flex", gap: "4px" }}>
        {onUpdateStatus && lead.status === "new" && (
          <button onClick={() => onUpdateStatus(lead.id, "reviewing")} style={primaryBtn}>
            Review
          </button>
        )}
        {onUpdateStatus && ["new", "reviewing"].includes(lead.status) && (
          <button onClick={() => onUpdateStatus(lead.id, "skipped")} style={btn}>
            Skip
          </button>
        )}
      </td>
    </tr>
  );
}
