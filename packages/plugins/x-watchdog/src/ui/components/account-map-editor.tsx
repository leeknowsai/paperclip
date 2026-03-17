import { useState, type CSSProperties } from "react";
import { usePluginAction, usePluginToast } from "@paperclipai/plugin-sdk/ui";

interface AccountEntry {
  chromeProfile: string;
  xUsername: string;
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

const row: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "8px",
};

const input: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: "8px",
  padding: "6px 10px",
  background: "transparent",
  color: "inherit",
  fontSize: "12px",
  boxSizing: "border-box",
  minWidth: 0,
  flex: 1,
};

const btn: CSSProperties = {
  appearance: "none",
  border: "1px solid var(--border)",
  borderRadius: "999px",
  background: "transparent",
  color: "inherit",
  padding: "6px 14px",
  fontSize: "12px",
  cursor: "pointer",
};

const primaryBtn: CSSProperties = {
  ...btn,
  background: "color-mix(in srgb, #2563eb 18%, transparent)",
  borderColor: "color-mix(in srgb, #2563eb 60%, var(--border))",
  color: "#93c5fd",
};

const dangerBtn: CSSProperties = {
  ...btn,
  padding: "3px 9px",
  fontSize: "11px",
  opacity: 0.6,
};

const thStyle: CSSProperties = {
  textAlign: "left",
  padding: "6px 10px",
  fontSize: "11px",
  fontWeight: 500,
  opacity: 0.5,
  borderBottom: "1px solid var(--border)",
  whiteSpace: "nowrap",
};

const tdStyle: CSSProperties = {
  padding: "7px 10px",
  fontSize: "12px",
  borderBottom: "1px solid color-mix(in srgb, var(--border) 50%, transparent)",
  verticalAlign: "middle",
};

export function AccountMapEditor({
  accountMap,
  onSaved,
}: {
  accountMap: Record<string, AccountEntry>;
  onSaved?: () => void;
}) {
  const [entries, setEntries] = useState<Array<{ slug: string } & AccountEntry>>(() =>
    Object.entries(accountMap).map(([slug, v]) => ({ slug, ...v }))
  );
  const [newSlug, setNewSlug] = useState("");
  const [newProfile, setNewProfile] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [saving, setSaving] = useState(false);

  const saveAccountMap = usePluginAction("save-account-map");
  const toast = usePluginToast();

  function addRow() {
    if (!newSlug.trim()) return;
    setEntries((prev) => [
      ...prev,
      { slug: newSlug.trim(), chromeProfile: newProfile.trim(), xUsername: newUsername.trim() },
    ]);
    setNewSlug("");
    setNewProfile("");
    setNewUsername("");
  }

  function deleteRow(slug: string) {
    setEntries((prev) => prev.filter((e) => e.slug !== slug));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const map: Record<string, AccountEntry> = {};
      for (const e of entries) {
        map[e.slug] = { chromeProfile: e.chromeProfile, xUsername: e.xUsername };
      }
      await saveAccountMap({ accountMap: map });
      toast({ title: "Saved", body: "Account map updated.", tone: "success" });
      onSaved?.();
    } catch {
      toast({ title: "Error", body: "Failed to save account map.", tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <strong>Chrome Profiles</strong>
        <span style={pill}>{entries.length}</span>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
          <thead>
            <tr>
              <th style={thStyle}>Project Slug</th>
              <th style={thStyle}>Chrome Profile</th>
              <th style={thStyle}>X Username</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr>
                <td colSpan={4} style={{ ...tdStyle, opacity: 0.5, textAlign: "center", padding: "16px" }}>
                  No entries yet.
                </td>
              </tr>
            )}
            {entries.map((e) => (
              <tr key={e.slug}>
                <td style={tdStyle}>{e.slug}</td>
                <td style={tdStyle}>{e.chromeProfile}</td>
                <td style={tdStyle}>{e.xUsername}</td>
                <td style={{ ...tdStyle, width: "40px" }}>
                  <button style={dangerBtn} onClick={() => deleteRow(e.slug)}>×</button>
                </td>
              </tr>
            ))}
            <tr>
              <td style={{ ...tdStyle, borderBottom: "none" }}>
                <input
                  value={newSlug}
                  onChange={(e) => setNewSlug(e.target.value)}
                  placeholder="slug"
                  style={input}
                />
              </td>
              <td style={{ ...tdStyle, borderBottom: "none" }}>
                <input
                  value={newProfile}
                  onChange={(e) => setNewProfile(e.target.value)}
                  placeholder="Profile Name"
                  style={input}
                />
              </td>
              <td style={{ ...tdStyle, borderBottom: "none" }}>
                <input
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder="@username"
                  style={input}
                />
              </td>
              <td style={{ ...tdStyle, borderBottom: "none", width: "40px" }}>
                <button style={primaryBtn} onClick={addRow}>Add</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={{ ...row, justifyContent: "flex-end" }}>
        <button style={primaryBtn} onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save Account Map"}
        </button>
      </div>
    </div>
  );
}
