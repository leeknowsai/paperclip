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

export function TweetCard({ tweet }: { tweet: TweetItem }) {
  return (
    <div
      style={{
        background: "#1a1a1a",
        border: "1px solid #333",
        borderRadius: "8px",
        padding: "12px 16px",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        {/* avatar placeholder */}
        <div
          style={{
            width: "32px",
            height: "32px",
            borderRadius: "50%",
            background: "#333",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#888",
            fontSize: "14px",
            fontWeight: 600,
          }}
        >
          {(tweet.username ?? "?")[0].toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: "#e0e0e0", fontSize: "13px", fontWeight: 600 }}>
            {tweet.displayName ?? tweet.username ?? "Unknown"}
            <span style={{ color: "#666", fontWeight: 400, marginLeft: "6px" }}>
              @{tweet.username}
            </span>
          </div>
        </div>
        <ScoreBadge score={tweet.aiScore} />
      </div>

      <div
        style={{
          color: "#ccc",
          fontSize: "13px",
          lineHeight: "1.5",
          whiteSpace: "pre-wrap",
          overflow: "hidden",
          maxHeight: "80px",
        }}
      >
        {tweet.content ?? ""}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <span style={{ color: "#555", fontSize: "11px" }}>{fmtDate(tweet.createdAt)}</span>
        {tweet.category && (
          <span
            style={{
              background: "#1f1f1f",
              color: "#888",
              borderRadius: "4px",
              padding: "1px 6px",
              fontSize: "11px",
            }}
          >
            {tweet.category}
          </span>
        )}
        {tweet.aiSummary && (
          <span style={{ color: "#666", fontSize: "11px", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {tweet.aiSummary}
          </span>
        )}
      </div>
    </div>
  );
}
