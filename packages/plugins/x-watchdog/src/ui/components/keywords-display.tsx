import type { CSSProperties } from "react";

interface Project {
  id: string;
  name: string;
  triggerKeywords?: string | string[] | null;
}

const card: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: "12px",
  padding: "14px",
  background: "var(--card, transparent)",
  display: "grid",
  gap: "12px",
};

const pill: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  borderRadius: "999px",
  border: "1px solid var(--border)",
  padding: "2px 8px",
  fontSize: "11px",
};

const keywordPill: CSSProperties = {
  ...pill,
  background: "color-mix(in srgb, #2563eb 12%, transparent)",
  borderColor: "color-mix(in srgb, #2563eb 40%, var(--border))",
  color: "#93c5fd",
};

const readOnlyPill: CSSProperties = {
  ...pill,
  opacity: 0.55,
  fontSize: "10px",
};

const row: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "6px",
};

const muted: CSSProperties = { fontSize: "12px", opacity: 0.72, lineHeight: 1.45 };

function parseKeywords(raw: string | string[] | null | undefined): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(Boolean);
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter(Boolean);
  } catch {
    // not JSON — treat as comma-separated
  }
  return raw.split(",").map((k) => k.trim()).filter(Boolean);
}

export function KeywordsDisplay({ projects }: { projects: Project[] }) {
  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <strong>Project Keywords</strong>
        <span style={readOnlyPill}>read-only</span>
      </div>

      {projects.length === 0 && (
        <div style={{ ...muted, textAlign: "center", padding: "12px 0" }}>
          No projects found.
        </div>
      )}

      {projects.map((p) => {
        const keywords = parseKeywords(p.triggerKeywords);
        return (
          <div key={p.id} style={{ display: "grid", gap: "6px" }}>
            <div style={{ fontSize: "12px", fontWeight: 500 }}>{p.name}</div>
            {keywords.length === 0 ? (
              <span style={{ ...muted, fontSize: "11px" }}>No keywords configured.</span>
            ) : (
              <div style={row}>
                {keywords.map((k) => (
                  <span key={k} style={keywordPill}>{k}</span>
                ))}
              </div>
            )}
          </div>
        );
      })}

      <div style={muted}>Edit keywords in project configuration.</div>
    </div>
  );
}
