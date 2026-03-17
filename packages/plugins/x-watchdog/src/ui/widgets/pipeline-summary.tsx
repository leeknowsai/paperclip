import { usePluginData } from "@paperclipai/plugin-sdk/ui";
import type { PluginWidgetProps } from "@paperclipai/plugin-sdk/ui";
import type { CSSProperties } from "react";

interface AnalyticsData {
  data: {
    volume: Array<{ day: string; count: number }>;
    scores: Array<{ bucket: string; count: number }>;
    topHandles: Array<{ handleId: string; username: string; highCount: number }>;
    topTags: Array<{ tag: string; count: number }>;
    period: string;
  };
}

const wrapper: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: "12px",
  padding: "14px",
  background: "var(--card, transparent)",
  display: "grid",
  gap: "10px",
};

const eyebrow: CSSProperties = {
  fontSize: "11px",
  opacity: 0.65,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};

const widgetGrid: CSSProperties = {
  display: "grid",
  gap: "8px",
  gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))",
};

const tones = {
  neutral: {
    background: "color-mix(in srgb, var(--foreground) 8%, transparent)",
    borderColor: "var(--border)",
    color: "inherit",
  },
  green: {
    background: "color-mix(in srgb, #16a34a 18%, transparent)",
    borderColor: "color-mix(in srgb, #16a34a 60%, var(--border))",
    color: "#86efac",
  },
  blue: {
    background: "color-mix(in srgb, #2563eb 18%, transparent)",
    borderColor: "color-mix(in srgb, #2563eb 60%, var(--border))",
    color: "#93c5fd",
  },
  amber: {
    background: "color-mix(in srgb, #d97706 18%, transparent)",
    borderColor: "color-mix(in srgb, #d97706 60%, var(--border))",
    color: "#fcd34d",
  },
} as const;

function KpiCard({ label, value, tone }: { label: string; value: string | number; tone: keyof typeof tones }) {
  const t = tones[tone];
  return (
    <div style={{
      border: `1px solid ${t.borderColor}`,
      borderRadius: "10px",
      padding: "10px 12px",
      background: t.background,
      display: "grid",
      gap: "4px",
    }}>
      <span style={eyebrow}>{label}</span>
      <span style={{ fontSize: "20px", fontWeight: 700, color: t.color }}>{value}</span>
    </div>
  );
}

export function PipelineSummary({ context }: PluginWidgetProps) {
  const { data, loading, error } = usePluginData<AnalyticsData>("analytics", { period: "7d" });

  if (loading) {
    return (
      <div style={wrapper}>
        <strong>X Watchdog Pipeline</strong>
        <span style={{ fontSize: "12px", opacity: 0.5 }}>Loading...</span>
      </div>
    );
  }

  if (error || !data?.data) {
    return (
      <div style={wrapper}>
        <strong>X Watchdog Pipeline</strong>
        <span style={{ fontSize: "12px", opacity: 0.5 }}>No analytics data available yet.</span>
      </div>
    );
  }

  const { volume, scores } = data.data;
  const totalTweets = volume.reduce((sum, v) => sum + v.count, 0);
  const highScore = scores.find((s) => s.bucket === "high")?.count ?? 0;
  const totalScored = scores.reduce((sum, s) => sum + s.count, 0);
  const convRate = totalScored > 0 ? ((highScore / totalScored) * 100).toFixed(1) : "0";
  const topHandleCount = data.data.topHandles.length;

  return (
    <div style={wrapper}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <strong>X Watchdog Pipeline</strong>
        <span style={{
          display: "inline-flex", alignItems: "center", borderRadius: "999px",
          border: "1px solid var(--border)", padding: "2px 8px", fontSize: "11px",
        }}>7d</span>
      </div>
      <div style={widgetGrid}>
        <KpiCard label="Tweets Scanned" value={totalTweets} tone="neutral" />
        <KpiCard label="High Score" value={highScore} tone="green" />
        <KpiCard label="High Rate" value={`${convRate}%`} tone="blue" />
        <KpiCard label="Top Handles" value={topHandleCount} tone="amber" />
      </div>
    </div>
  );
}
