/**
 * Telegram Web Client — interact with web.telegram.org via Chrome DevTools Protocol.
 * Uses raw WebSocket CDP (same pattern as x-search plugin scraper), NOT puppeteer.
 */

import { WebSocket } from "ws";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------- Types ----------

export interface TgMessage {
  id: string; // synthetic: groupId_timestamp_hash
  groupId: string;
  senderUsername: string;
  senderDisplayName: string;
  text: string;
  timestamp: string; // ISO string
}

export interface TgMember {
  username: string;
  displayName: string;
  isOnline?: boolean;
}

// ---------- CDP Session ----------

class CDPSession {
  private ws!: WebSocket;
  private msgId = 1;
  private pending = new Map<
    number,
    { resolve: (v: any) => void; reject: (e: any) => void }
  >();

  async connect(wsUrl: string) {
    this.ws = new WebSocket(wsUrl);
    await new Promise<void>((resolve, reject) => {
      this.ws.on("open", () => resolve());
      this.ws.on("error", (e: Error) => reject(e));
      setTimeout(() => reject(new Error("CDP connection timeout")), 10000);
    });
    this.ws.on("message", (raw: Buffer | string) => {
      const data = JSON.parse(raw.toString());
      if (data.id && this.pending.has(data.id)) {
        const p = this.pending.get(data.id)!;
        this.pending.delete(data.id);
        if (data.error) p.reject(new Error(data.error.message));
        else p.resolve(data.result);
      }
    });
  }

  send(method: string, params: any = {}): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = this.msgId++;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }
      }, 30000);
    });
  }

  close() {
    try {
      this.ws.close();
    } catch {
      // ignore
    }
  }
}

// ---------- Helper: simple hash for synthetic IDs ----------

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    hash = ((hash << 5) - hash + ch) | 0;
  }
  return Math.abs(hash).toString(36).slice(0, 8);
}

// ---------- Tab Discovery ----------

async function findOrOpenTgTab(
  cdpPort: number,
): Promise<{ wsUrl: string }> {
  const res = await fetch(`http://localhost:${cdpPort}/json`);
  const targets = (await res.json()) as any[];
  const tgTab = targets.find(
    (t: any) => t.type === "page" && t.url?.includes("web.telegram.org"),
  );
  if (tgTab) return { wsUrl: tgTab.webSocketDebuggerUrl };

  // Open new tab
  const newRes = await fetch(
    `http://localhost:${cdpPort}/json/new?${encodeURIComponent("https://web.telegram.org/a/")}`,
  );
  const newTab = (await newRes.json()) as any;
  return { wsUrl: newTab.webSocketDebuggerUrl };
}

// ---------- Public API ----------

/**
 * Connect to Chrome with CDP and find (or open) a Telegram Web tab.
 * Assumes Chrome is already running with `--remote-debugging-port`.
 */
export async function launchTgSession(
  cdpPort = 9222,
): Promise<{ wsUrl: string }> {
  try {
    const versionRes = await fetch(
      `http://localhost:${cdpPort}/json/version`,
    );
    if (!versionRes.ok) {
      throw new Error(`CDP not available on port ${cdpPort}`);
    }
  } catch (e: any) {
    throw new Error(
      `Chrome not running with CDP on port ${cdpPort}: ${e.message}`,
    );
  }

  const { wsUrl } = await findOrOpenTgTab(cdpPort);

  // Wait for page to settle
  const cdp = new CDPSession();
  try {
    await cdp.connect(wsUrl);
    await sleep(2000);

    // Check if we're on TG — if not, navigate
    const result = await cdp.send("Runtime.evaluate", {
      expression: "window.location.href",
      returnByValue: true,
    });
    const currentUrl = result?.result?.value ?? "";
    if (!currentUrl.includes("web.telegram.org")) {
      await cdp.send("Page.navigate", {
        url: "https://web.telegram.org/a/",
      });
      await sleep(3000);
    }
  } finally {
    cdp.close();
  }

  return { wsUrl };
}

/**
 * Extract localStorage + cookies from TG web tab for session persistence.
 * Returns a JSON string that can be stored and later restored.
 */
export async function saveTgSession(cdpPort: number): Promise<string> {
  const { wsUrl } = await findOrOpenTgTab(cdpPort);
  const cdp = new CDPSession();

  try {
    await cdp.connect(wsUrl);

    // Get cookies via CDP Network domain
    const cookieResult = await cdp.send("Network.getCookies", {
      urls: ["https://web.telegram.org"],
    });
    const cookies = cookieResult?.cookies ?? [];

    // Get localStorage
    const lsResult = await cdp.send("Runtime.evaluate", {
      expression: `(() => {
        const data = {};
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          data[key] = localStorage.getItem(key);
        }
        return JSON.stringify(data);
      })()`,
      returnByValue: true,
    });
    const localStorage = lsResult?.result?.value ?? "{}";

    const sessionData = JSON.stringify({
      cookies,
      localStorage: JSON.parse(localStorage),
      savedAt: new Date().toISOString(),
    });

    return sessionData;
  } finally {
    cdp.close();
  }
}

/**
 * Restore a previously saved TG session (cookies + localStorage).
 */
export async function restoreTgSession(
  wsUrl: string,
  sessionData: string,
): Promise<void> {
  const cdp = new CDPSession();

  try {
    await cdp.connect(wsUrl);
    const data = JSON.parse(sessionData);

    // Restore cookies
    if (data.cookies?.length > 0) {
      for (const cookie of data.cookies) {
        try {
          await cdp.send("Network.setCookie", cookie);
        } catch {
          // Skip individual cookie failures
        }
      }
    }

    // Restore localStorage
    if (data.localStorage && typeof data.localStorage === "object") {
      const lsJson = JSON.stringify(data.localStorage);
      await cdp.send("Runtime.evaluate", {
        expression: `(() => {
          const data = ${lsJson};
          for (const [key, value] of Object.entries(data)) {
            localStorage.setItem(key, value);
          }
          return true;
        })()`,
        returnByValue: true,
      });
    }

    // Reload to apply session
    await cdp.send("Page.reload", {});
    await sleep(3000);
  } finally {
    cdp.close();
  }
}

// ---------- DOM Scraping: Messages ----------

const EXTRACT_MESSAGES_JS = (groupId: string, sinceIso?: string) => `
(() => {
  const groupId = ${JSON.stringify(groupId)};
  const sinceTs = ${sinceIso ? JSON.stringify(sinceIso) : "null"};
  const messages = [];

  // TG Web App A uses .message-list-item or .Message elements
  // Try multiple selectors for compatibility with /a/ and /k/ versions
  const msgEls = document.querySelectorAll(
    '.message-list-item, .Message, [class*="message"][data-message-id], .bubble'
  );

  for (const el of msgEls) {
    try {
      // Extract sender info
      const senderEl = el.querySelector(
        '.message-title, .sender-title, [class*="message-title"], .peer-title, .name'
      );
      const senderDisplayName = senderEl?.textContent?.trim() ?? '';

      // Username from data attribute or link
      const usernameLink = el.querySelector('a[href*="@"], [data-peer-id]');
      let senderUsername = '';
      if (usernameLink) {
        const href = usernameLink.getAttribute('href') ?? '';
        const match = href.match(/@([\\w]+)/);
        if (match) senderUsername = match[1];
      }

      // Text content
      const textEl = el.querySelector(
        '.text-content, .message-content-text, [class*="text-content"], .message-text, .text'
      );
      const text = textEl?.textContent?.trim() ?? '';
      if (!text) continue;

      // Timestamp
      const timeEl = el.querySelector(
        '.message-time, .time, time, [class*="time"], .message-date'
      );
      let timestamp = '';
      if (timeEl) {
        const datetime = timeEl.getAttribute('datetime');
        const title = timeEl.getAttribute('title');
        const textTime = timeEl.textContent?.trim() ?? '';
        if (datetime) {
          timestamp = datetime;
        } else if (title) {
          // Try to parse "March 15, 2026 3:45 PM" style
          try { timestamp = new Date(title).toISOString(); } catch {}
        }
        if (!timestamp && textTime) {
          // HH:MM format — assume today
          const match = textTime.match(/(\\d{1,2}):(\\d{2})/);
          if (match) {
            const now = new Date();
            now.setHours(parseInt(match[1]), parseInt(match[2]), 0, 0);
            timestamp = now.toISOString();
          }
        }
      }
      if (!timestamp) timestamp = new Date().toISOString();

      // Filter by since
      if (sinceTs && timestamp < sinceTs) continue;

      // Generate synthetic ID
      const raw = groupId + '_' + timestamp + '_' + text.slice(0, 30);
      let hash = 0;
      for (let i = 0; i < raw.length; i++) {
        hash = ((hash << 5) - hash + raw.charCodeAt(i)) | 0;
      }
      const id = groupId + '_' + timestamp.replace(/[^0-9]/g, '').slice(0, 12) + '_' + Math.abs(hash).toString(36).slice(0, 8);

      messages.push({
        id,
        groupId,
        senderUsername,
        senderDisplayName,
        text,
        timestamp,
      });
    } catch (e) {
      // skip malformed message elements
    }
  }

  return JSON.stringify(messages);
})()
`;

/**
 * Navigate to a TG group and scrape visible messages from the DOM.
 * Returns empty array on failure.
 */
export async function getGroupMessages(
  wsUrl: string,
  groupId: string,
  since?: string,
): Promise<TgMessage[]> {
  const cdp = new CDPSession();

  try {
    await cdp.connect(wsUrl);

    // Navigate to the group (using hash-based routing)
    await cdp.send("Runtime.evaluate", {
      expression: `(() => {
        // TG Web /a/ uses hash routing like #-groupId
        // TG Web /k/ uses path routing
        const url = window.location.href;
        if (url.includes('/a/')) {
          window.location.hash = '#-${groupId}';
        } else {
          window.location.hash = '#${groupId}';
        }
        return true;
      })()`,
      returnByValue: true,
    });

    // Wait for messages to load
    await sleep(3000);

    // Scroll up to load more messages if needed
    await cdp.send("Runtime.evaluate", {
      expression: `(() => {
        const container = document.querySelector('.messages-container, .bubbles, [class*="messages-container"], .MessageList');
        if (container) container.scrollTop = 0;
        return true;
      })()`,
      returnByValue: true,
    });
    await sleep(2000);

    // Extract messages
    const result = await cdp.send("Runtime.evaluate", {
      expression: EXTRACT_MESSAGES_JS(groupId, since),
      returnByValue: true,
    });

    const raw = result?.result?.value ?? "[]";
    return JSON.parse(raw) as TgMessage[];
  } catch (e: any) {
    console.error(`getGroupMessages error: ${e.message}`);
    return [];
  } finally {
    cdp.close();
  }
}

// ---------- DOM Scraping: Members ----------

const EXTRACT_MEMBERS_JS = `
(() => {
  const members = [];

  // Try multiple selectors for the member list panel
  const memberEls = document.querySelectorAll(
    '.ChatInfo .ListItem, .group-members .ListItem, [class*="member"] .ListItem, .sidebar-right .ListItem, .chat-info .ListItem, .MemberList .ListItem'
  );

  for (const el of memberEls) {
    try {
      const nameEl = el.querySelector(
        '.ListItem-title, .peer-title, .fullName, [class*="title"], h3'
      );
      const displayName = nameEl?.textContent?.trim() ?? '';
      if (!displayName) continue;

      // Username
      const usernameEl = el.querySelector(
        '.ListItem-subtitle, .username, [class*="username"], [class*="subtitle"]'
      );
      let username = usernameEl?.textContent?.trim() ?? '';
      // Remove @ prefix if present
      if (username.startsWith('@')) username = username.slice(1);

      // Online status
      const statusEl = el.querySelector(
        '.user-status, .status, [class*="status"], .last-seen'
      );
      const statusText = statusEl?.textContent?.trim()?.toLowerCase() ?? '';
      const isOnline = statusText === 'online' || statusText.includes('online');

      members.push({
        username,
        displayName,
        isOnline,
      });
    } catch (e) {
      // skip
    }
  }

  return JSON.stringify(members);
})()
`;

/**
 * Open the group members panel and scrape the member list.
 * Returns empty array on failure.
 */
export async function getGroupMembers(
  wsUrl: string,
  groupId: string,
): Promise<TgMember[]> {
  const cdp = new CDPSession();

  try {
    await cdp.connect(wsUrl);

    // Navigate to the group first
    await cdp.send("Runtime.evaluate", {
      expression: `(() => {
        const url = window.location.href;
        if (url.includes('/a/')) {
          window.location.hash = '#-${groupId}';
        } else {
          window.location.hash = '#${groupId}';
        }
        return true;
      })()`,
      returnByValue: true,
    });
    await sleep(2000);

    // Click group header to open info/members panel
    await cdp.send("Runtime.evaluate", {
      expression: `(() => {
        // Try clicking the group header / chat title
        const header = document.querySelector(
          '.TopBar .chat-info, .MiddleHeader .ChatInfo, [class*="chat-info"], .top-bar .info, .topbar .peer-title'
        );
        if (header) {
          header.click();
          return 'clicked-header';
        }
        // Fallback: try the title text itself
        const title = document.querySelector('.chat-title, .peer-title, [class*="chat-title"]');
        if (title) {
          title.click();
          return 'clicked-title';
        }
        return 'no-header-found';
      })()`,
      returnByValue: true,
    });
    await sleep(2000);

    // Try to click "Members" tab/link in the info panel
    await cdp.send("Runtime.evaluate", {
      expression: `(() => {
        const tabs = document.querySelectorAll(
          '.TabList .Tab, .sidebar-right .Tab, [class*="tab"], button'
        );
        for (const tab of tabs) {
          const text = tab.textContent?.trim()?.toLowerCase() ?? '';
          if (text === 'members' || text.includes('members') || text.includes('participants')) {
            tab.click();
            return 'clicked-members-tab';
          }
        }
        return 'no-members-tab';
      })()`,
      returnByValue: true,
    });
    await sleep(2000);

    // Scrape member list
    const result = await cdp.send("Runtime.evaluate", {
      expression: EXTRACT_MEMBERS_JS,
      returnByValue: true,
    });

    const raw = result?.result?.value ?? "[]";
    return JSON.parse(raw) as TgMember[];
  } catch (e: any) {
    console.error(`getGroupMembers error: ${e.message}`);
    return [];
  } finally {
    cdp.close();
  }
}

// ---------- QR Code Login ----------

/**
 * Check if the TG login screen with QR code is displayed.
 * If so, extract the QR code as a data URL. Returns null if already logged in.
 */
export async function getQrCodeForLogin(
  wsUrl: string,
): Promise<string | null> {
  const cdp = new CDPSession();

  try {
    await cdp.connect(wsUrl);

    const result = await cdp.send("Runtime.evaluate", {
      expression: `(() => {
        // Check for QR code on login page
        // TG Web /a/ renders QR as a canvas element
        const canvas = document.querySelector(
          'canvas.qr-canvas, [class*="qr"] canvas, .auth-image canvas, canvas'
        );
        if (canvas && canvas.tagName === 'CANVAS') {
          try {
            return canvas.toDataURL('image/png');
          } catch (e) {
            // CORS or tainted canvas
          }
        }

        // Check for QR code as an img element
        const img = document.querySelector(
          'img[class*="qr"], .auth-image img, [class*="qr-code"] img'
        );
        if (img && img.src) {
          // If it's already a data URL, return as-is
          if (img.src.startsWith('data:')) return img.src;
          // Otherwise we can't easily convert without CORS
          return img.src;
        }

        // Check for SVG-based QR
        const svg = document.querySelector('[class*="qr"] svg, .auth-image svg');
        if (svg) {
          const serializer = new XMLSerializer();
          const svgStr = serializer.serializeToString(svg);
          return 'data:image/svg+xml;base64,' + btoa(svgStr);
        }

        // No QR found — probably already logged in
        return null;
      })()`,
      returnByValue: true,
    });

    return result?.result?.value ?? null;
  } catch (e: any) {
    console.error(`getQrCodeForLogin error: ${e.message}`);
    return null;
  } finally {
    cdp.close();
  }
}
