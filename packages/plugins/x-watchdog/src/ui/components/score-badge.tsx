import type { CSSProperties } from "react";

const tiers = {
  high: {
    background: "color-mix(in srgb, #16a34a 18%, transparent)",
    borderColor: "color-mix(in srgb, #16a34a 60%, var(--border))",
    color: "#86efac",
  },
  mid: {
    background: "color-mix(in srgb, #2563eb 18%, transparent)",
    borderColor: "color-mix(in srgb, #2563eb 60%, var(--border))",
    color: "#93c5fd",
  },
  low: {
    background: "color-mix(in srgb, #d97706 18%, transparent)",
    borderColor: "color-mix(in srgb, #d97706 60%, var(--border))",
    color: "#fcd34d",
  },
  none: {
    background: "transparent",
    borderColor: "var(--border)",
    color: "inherit",
  },
} as const;

function tier(score: number | null | undefined): keyof typeof tiers {
  if (score == null) return "none";
  if (score >= 7) return "high";
  if (score >= 4) return "mid";
  return "low";
}

export function ScoreBadge({ score, style }: { score: number | null | undefined; style?: CSSProperties }) {
  const t = tiers[tier(score)];
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: "999px",
      border: `1px solid ${t.borderColor}`,
      background: t.background,
      color: t.color,
      padding: "2px 8px",
      fontSize: "11px",
      fontWeight: 600,
      minWidth: "28px",
      ...style,
    }}>
      {score != null ? score.toFixed(1) : "--"}
    </span>
  );
}
