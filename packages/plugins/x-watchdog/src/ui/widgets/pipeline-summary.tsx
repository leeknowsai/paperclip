import { usePluginData } from "@paperclipai/plugin-sdk/ui";
import type { PluginWidgetProps } from "@paperclipai/plugin-sdk/ui";

interface AnalyticsData {
  data: {
    volume: Array<{ day: string; count: number }>;
    scores: Array<{ bucket: string; count: number }>;
    topHandles: Array<{ handleId: string; username: string; highCount: number }>;
    topTags: Array<{ tag: string; count: number }>;
    period: string;
  };
}

const kpiCard = (label: string, value: string | number, color: string) => (
  <div
    style={{
      flex: "1 1 0",
      minWidth: "100px",
      background: "#111",
      borderRadius: "6px",
      padding: "10px 14px",
      display: "flex",
      flexDirection: "column" as const,
      gap: "4px",
    }}
  >
    <span style={{ fontSize: "11px", color: "#666", fontWeight: 500 }}>{label}</span>
    <span style={{ fontSize: "20px", fontWeight: 700, color }}>{value}</span>
  </div>
);

export function PipelineSummary({ context }: PluginWidgetProps) {
  const { data, loading, error } = usePluginData<AnalyticsData>("analytics", { period: "7d" });

  if (loading) {
    return (
      <div style={{ padding: "12px 16px", background: "#1a1a1a", borderRadius: "8px", border: "1px solid #333" }}>
        <div style={{ fontSize: "13px", fontWeight: 600, color: "#e0e0e0", marginBottom: "8px" }}>X Watchdog Pipeline</div>
        <div style={{ color: "#666", fontSize: "12px" }}>Loading...</div>
      </div>
    );
  }

  if (error || !data?.data) {
    return (
      <div style={{ padding: "12px 16px", background: "#1a1a1a", borderRadius: "8px", border: "1px solid #333" }}>
        <div style={{ fontSize: "13px", fontWeight: 600, color: "#e0e0e0", marginBottom: "8px" }}>X Watchdog Pipeline</div>
        <div style={{ color: "#555", fontSize: "12px" }}>No analytics data available yet.</div>
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
    <div style={{ padding: "12px 16px", background: "#1a1a1a", borderRadius: "8px", border: "1px solid #333" }}>
      <div style={{ fontSize: "13px", fontWeight: 600, color: "#e0e0e0", marginBottom: "10px" }}>
        X Watchdog Pipeline
        <span style={{ marginLeft: "8px", color: "#555", fontWeight: 400, fontSize: "11px" }}>7d</span>
      </div>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        {kpiCard("Tweets Scanned", totalTweets, "#e0e0e0")}
        {kpiCard("High Score", highScore, "#22c55e")}
        {kpiCard("High Rate", `${convRate}%`, "#3b82f6")}
        {kpiCard("Top Handles", topHandleCount, "#f59e0b")}
      </div>
    </div>
  );
}
