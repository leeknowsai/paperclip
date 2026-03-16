import type { CSSProperties } from "react";

const colors: Record<string, { bg: string; fg: string }> = {
  high: { bg: "#14532d", fg: "#22c55e" },
  mid: { bg: "#1e3a5f", fg: "#3b82f6" },
  low: { bg: "#422006", fg: "#f59e0b" },
  none: { bg: "#1f1f1f", fg: "#666" },
};

function tier(score: number | null | undefined): keyof typeof colors {
  if (score == null) return "none";
  if (score >= 7) return "high";
  if (score >= 4) return "mid";
  return "low";
}

export function ScoreBadge({
  score,
  style,
}: {
  score: number | null | undefined;
  style?: CSSProperties;
}) {
  const t = tier(score);
  const c = colors[t];
  return (
    <span
      style={{
        display: "inline-block",
        background: c.bg,
        color: c.fg,
        borderRadius: "4px",
        padding: "2px 8px",
        fontSize: "12px",
        fontWeight: 600,
        minWidth: "28px",
        textAlign: "center",
        ...style,
      }}
    >
      {score != null ? score.toFixed(1) : "--"}
    </span>
  );
}
