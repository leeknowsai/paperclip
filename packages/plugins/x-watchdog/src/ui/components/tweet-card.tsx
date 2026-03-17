import { ScoreBadge } from "./score-badge.js";

interface TweetItem {
  id: string;
  content: string | null;
  createdAt: string | number | null;
  aiScore: number | null;
  aiSummary: string | null;
  username: string | null;
  displayName: string | null;
  category: string | null;
}

function fmtDate(v: string | number | null): string {
  if (!v) return "";
  const d = typeof v === "number" ? new Date(v * 1000) : new Date(v);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

const pill = (bg: string, fg: string) => ({
  display: "inline-flex" as const,
  alignItems: "center" as const,
  borderRadius: "999px",
  border: `1px solid ${bg}`,
  background: bg,
  color: fg,
  padding: "2px 8px",
  fontSize: "11px",
});

export function TweetCard({ tweet }: { tweet: TweetItem }) {
  return (
    <div style={{
      border: "1px solid var(--border)",
      borderRadius: "12px",
      padding: "12px 14px",
      background: "var(--card, transparent)",
      display: "grid",
      gap: "8px",
    }}>
      {/* Header: avatar + name + score */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <div style={{
          width: "32px", height: "32px", borderRadius: "50%", flexShrink: 0,
          background: "color-mix(in srgb, var(--foreground) 12%, transparent)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "14px", fontWeight: 600, opacity: 0.7,
        }}>
          {(tweet.username ?? "?")[0].toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong style={{ fontSize: "13px" }}>
            {tweet.displayName ?? tweet.username ?? "Unknown"}
          </strong>
          <span style={{ opacity: 0.5, marginLeft: "6px", fontSize: "12px" }}>
            @{tweet.username}
          </span>
        </div>
        <ScoreBadge score={tweet.aiScore} />
      </div>

      {/* Content */}
      <div style={{
        fontSize: "12px", lineHeight: 1.5, opacity: 0.85,
        whiteSpace: "pre-wrap", overflow: "hidden", maxHeight: "80px",
      }}>
        {tweet.content ?? ""}
      </div>

      {/* Footer: date + category + summary */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
        <span style={{ fontSize: "11px", opacity: 0.5 }}>{fmtDate(tweet.createdAt)}</span>
        {tweet.category && (
          <span style={pill(
            "color-mix(in srgb, var(--border) 75%, transparent)",
            "inherit",
          )}>{tweet.category}</span>
        )}
        {tweet.aiSummary && (
          <span style={{
            fontSize: "11px", opacity: 0.55, flex: 1,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {tweet.aiSummary}
          </span>
        )}
      </div>
    </div>
  );
}
