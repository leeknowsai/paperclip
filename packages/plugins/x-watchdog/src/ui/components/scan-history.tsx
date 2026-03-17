import type { CSSProperties } from "react";

interface LastScan {
  timestamp: string | number;
  totalScraped: number;
  newTweets: number;
  scored: number;
  stored?: number;
  leadsCreated?: number;
  reportUrl?: string;
}

const card: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: "12px",
  padding: "14px",
  background: "var(--card, transparent)",
  display: "grid",
  gap: "12px",
};

const widgetGrid: CSSProperties = {
  display: "grid",
  gap: "12px",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
};

const eyebrow: CSSProperties = {
  fontSize: "11px",
  opacity: 0.65,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};

const muted: CSSProperties = { fontSize: "12px", opacity: 0.72, lineHeight: 1.45 };

const row: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "8px",
};

function KpiWidget({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: "14px",
        padding: "14px",
        display: "grid",
        gap: "6px",
        background: `color-mix(in srgb, ${color} 10%, transparent)`,
        borderColor: `color-mix(in srgb, ${color} 30%, var(--border))`,
      }}
    >
      <div style={eyebrow}>{label}</div>
      <strong style={{ fontSize: "22px", color: `color-mix(in srgb, ${color} 80%, var(--foreground))` }}>
        {value}
      </strong>
    </div>
  );
}

export function ScanHistory({ lastScan }: { lastScan: LastScan | null | undefined }) {
  if (!lastScan) {
    return (
      <div style={card}>
        <div style={eyebrow}>Last Scan</div>
        <div style={{ ...muted, textAlign: "center", padding: "16px 0" }}>
          No scans yet. Run chrome-scrape tool to start.
        </div>
      </div>
    );
  }

  const ts = new Date(lastScan.timestamp);
  const timeLabel = isNaN(ts.getTime())
    ? String(lastScan.timestamp)
    : ts.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

  return (
    <div style={card}>
      <div style={eyebrow}>Last Scan</div>
      <div style={widgetGrid}>
        <KpiWidget label="Scraped" value={lastScan.totalScraped} color="#6b7280" />
        <KpiWidget label="New" value={lastScan.newTweets} color="#16a34a" />
        <KpiWidget label="Scored" value={lastScan.scored} color="#2563eb" />
        <KpiWidget label="Leads Created" value={lastScan.leadsCreated ?? 0} color="#d97706" />
      </div>
      <div style={{ ...row, justifyContent: "space-between" }}>
        <span style={muted}>{timeLabel}</span>
        {lastScan.reportUrl && (
          <a
            href={lastScan.reportUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: "12px", opacity: 0.8, textDecoration: "none", color: "#93c5fd" }}
          >
            View Report →
          </a>
        )}
      </div>
    </div>
  );
}
