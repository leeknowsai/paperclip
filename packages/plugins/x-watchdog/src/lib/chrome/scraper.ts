/**
 * CDP scraper: connect to Chrome search tabs, extract tweets, dedup, AI score, store, report.
 * Adapted from x-search/src/lib/scraper.ts — HTTP calls replaced with dependency injection callbacks.
 */

import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { WebSocket } from "ws";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------- Types ----------

export interface TweetData {
  tweetId: string;
  text: string;
  authorUsername: string;
  authorName: string;
  timestamp: string;
  likes: number;
  retweets: number;
  replies: number;
  views: number;
  url: string;
  keyword: string;
  profile: string;
}

export interface ScoredTweet extends TweetData {
  score: number;
  summary: string;
  tags: string[];
}

export interface ScrapeResult {
  totalScraped: number;
  newTweets: number;
  scored: number;
  stored: number;
  leadsCreated: number;
  reportUrl: string;
  errors: string[];
}

export type ScraperDeps = {
  cdpPort: number;
  checkExistingTweetIds: (ids: string[]) => string[]; // returns existing IDs
  scoreTweets: (tweets: TweetData[]) => Promise<ScoredTweet[]>;
  storeTweets: (tweets: ScoredTweet[]) => number; // returns inserted count
  detectAndCreateLeads: (tweets: ScoredTweet[]) => number; // returns leads created
  sendNotification?: (message: string) => Promise<void>;
};

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

// ---------- DOM extraction JS ----------

const EXTRACT_TWEETS_JS = `
(() => {
  const tweets = [];
  const articles = document.querySelectorAll('article[data-testid="tweet"]');
  for (const article of articles) {
    try {
      const userLink = article.querySelector('a[href*="/"][role="link"][tabindex="-1"]');
      const authorUsername = userLink?.getAttribute('href')?.replace('/', '') ?? '';
      const displayNameEl = article.querySelector('a[href*="/"][role="link"][tabindex="-1"] span');
      const authorName = displayNameEl?.textContent ?? '';
      const textEl = article.querySelector('[data-testid="tweetText"]');
      const text = textEl?.textContent ?? '';
      const timeEl = article.querySelector('time');
      const timestamp = timeEl?.getAttribute('datetime') ?? '';
      const statusLink = article.querySelector('a[href*="/status/"]');
      const statusHref = statusLink?.getAttribute('href') ?? '';
      const tweetIdMatch = statusHref.match(/status\\/(\\d+)/);
      const tweetId = tweetIdMatch ? tweetIdMatch[1] : '';

      const getMetric = (testId) => {
        const el = article.querySelector('[data-testid="' + testId + '"]');
        const text = el?.getAttribute('aria-label') ?? el?.textContent ?? '0';
        const match = text.match(/([\\d,.]+[KMB]?)/);
        if (!match) return 0;
        let val = match[1].replace(/,/g, '');
        if (val.endsWith('K')) return Math.round(parseFloat(val) * 1000);
        if (val.endsWith('M')) return Math.round(parseFloat(val) * 1000000);
        if (val.endsWith('B')) return Math.round(parseFloat(val) * 1000000000);
        return parseInt(val) || 0;
      };

      const likes = getMetric('like');
      const retweets = getMetric('retweet');
      const replies = getMetric('reply');

      const analyticsEl = article.querySelector('a[href*="/analytics"]');
      const viewsText = analyticsEl?.getAttribute('aria-label') ?? '0';
      const viewsMatch = viewsText.match(/([\\d,.]+[KMB]?)/);
      let views = 0;
      if (viewsMatch) {
        let v = viewsMatch[1].replace(/,/g, '');
        if (v.endsWith('K')) views = Math.round(parseFloat(v) * 1000);
        else if (v.endsWith('M')) views = Math.round(parseFloat(v) * 1000000);
        else views = parseInt(v) || 0;
      }

      if (tweetId && text) {
        tweets.push({ tweetId, text, authorUsername, authorName, timestamp, likes, retweets, replies, views });
      }
    } catch (e) {}
  }
  return JSON.stringify(tweets);
})()
`;

const SCROLL_JS = `(() => { window.scrollBy(0, 3000); return true; })()`;

// ---------- Get search tabs from CDP ----------

async function getSearchTabs(
  cdpPort: number,
): Promise<{ id: string; title: string; url: string; wsUrl: string }[]> {
  const res = await fetch(`http://localhost:${cdpPort}/json`);
  const targets = (await res.json()) as any[];
  return targets
    .filter((t: any) => t.type === "page" && t.url?.includes("x.com/search"))
    .map((t: any) => ({
      id: t.id,
      title: t.title,
      url: t.url,
      wsUrl: t.webSocketDebuggerUrl,
    }));
}

function extractKeywordFromUrl(url: string): string {
  try {
    return new URL(url).searchParams.get("q") ?? "unknown";
  } catch {
    return "unknown";
  }
}

// ---------- Scrape single tab ----------

async function scrapeTweets(
  tab: { url: string; wsUrl: string },
  scrollCount = 2,
): Promise<TweetData[]> {
  const keyword = extractKeywordFromUrl(tab.url);
  const cdp = new CDPSession();

  try {
    await cdp.connect(tab.wsUrl);

    let result = await cdp.send("Runtime.evaluate", {
      expression: EXTRACT_TWEETS_JS,
      returnByValue: true,
    });
    let allTweets: any[] = JSON.parse(result.result.value ?? "[]");

    for (let i = 0; i < scrollCount; i++) {
      await cdp.send("Runtime.evaluate", {
        expression: SCROLL_JS,
        returnByValue: true,
      });
      await sleep(2000);
      result = await cdp.send("Runtime.evaluate", {
        expression: EXTRACT_TWEETS_JS,
        returnByValue: true,
      });
      const newTweets = JSON.parse(result.result.value ?? "[]");
      const seen = new Set(allTweets.map((t: any) => t.tweetId));
      for (const t of newTweets) {
        if (!seen.has(t.tweetId)) {
          allTweets.push(t);
          seen.add(t.tweetId);
        }
      }
    }

    cdp.close();

    return allTweets.map((t: any) => ({
      ...t,
      url: `https://x.com/${t.authorUsername}/status/${t.tweetId}`,
      keyword,
      profile: "unknown",
    }));
  } catch (e: any) {
    cdp.close();
    throw e;
  }
}

// ---------- Telegraph report ----------

function postToTelegraph(
  title: string,
  html: string,
  telegraphScriptPath: string,
): string {
  try {
    const result = execSync(
      `bash "${telegraphScriptPath}" "${title}" "${html.replace(/"/g, '\\"')}"`,
      { encoding: "utf8", timeout: 15000 },
    );
    return result.trim();
  } catch {
    return "";
  }
}

// ---------- Main scrape orchestrator ----------

export async function searchXScrape(
  deps: ScraperDeps,
  options: { limit?: number; skipScore?: boolean },
  log: (msg: string) => void = console.log,
): Promise<ScrapeResult> {
  const errors: string[] = [];

  // Verify CDP
  try {
    const versionRes = await fetch(
      `http://localhost:${deps.cdpPort}/json/version`,
    );
    const version = (await versionRes.json()) as any;
    log(`Chrome CDP connected: ${version.Browser}`);
  } catch {
    return {
      totalScraped: 0,
      newTweets: 0,
      scored: 0,
      stored: 0,
      leadsCreated: 0,
      reportUrl: "",
      errors: ["Chrome not running with CDP. Run search-x-open first."],
    };
  }

  // Get search tabs
  const tabs = await getSearchTabs(deps.cdpPort);
  const activeTabs = options.limit ? tabs.slice(0, options.limit) : tabs;
  log(`Found ${tabs.length} search tabs${options.limit ? ` (limiting to ${activeTabs.length})` : ""}`);

  if (activeTabs.length === 0) {
    return {
      totalScraped: 0,
      newTweets: 0,
      scored: 0,
      stored: 0,
      leadsCreated: 0,
      reportUrl: "",
      errors: ["No X search tabs found. Run search-x-open first."],
    };
  }

  // Phase 1: Scrape all tabs
  log("[Phase 1] Scraping tweets from tabs...");
  const allTweets = new Map<string, TweetData>();
  let tabCount = 0;

  for (const tab of activeTabs) {
    tabCount++;
    const keyword = extractKeywordFromUrl(tab.url);
    log(`  [${tabCount}/${activeTabs.length}] Scraping: "${keyword}"...`);
    try {
      const tweets = await scrapeTweets(tab);
      let newCount = 0;
      for (const t of tweets) {
        if (!allTweets.has(t.tweetId)) {
          allTweets.set(t.tweetId, t);
          newCount++;
        }
      }
      log(`    → ${tweets.length} tweets found, ${newCount} new (total: ${allTweets.size})`);
    } catch (e: any) {
      errors.push(`Tab "${keyword}": ${e.message}`);
      log(`    → Error: ${e.message}`);
    }
    await sleep(500);
  }

  const uniqueTweets = [...allTweets.values()];
  log(`[Phase 1 Complete] ${uniqueTweets.length} unique tweets from ${tabCount} tabs`);

  // Phase 2: Dedup against DB
  log("[Phase 2] Checking for existing tweets in DB...");
  let newTweets = uniqueTweets;
  try {
    const tweetIds = uniqueTweets.map((t) => t.tweetId);
    const existingIds = new Set<string>(deps.checkExistingTweetIds(tweetIds));
    newTweets = uniqueTweets.filter((t) => !existingIds.has(t.tweetId));
    log(`  ${uniqueTweets.length} total → ${existingIds.size} in DB → ${newTweets.length} new`);
  } catch (e: any) {
    log(`  Dedup check failed (${e.message}), proceeding with all tweets`);
  }

  // Phase 3: AI Scoring
  let scoredTweets: ScoredTweet[] = [];
  if (!options.skipScore && newTweets.length > 0) {
    log("[Phase 3] AI scoring...");
    try {
      scoredTweets = await deps.scoreTweets(newTweets);
      const highQualityCount = scoredTweets.filter((t) => t.score >= 6).length;
      log(`  ${scoredTweets.length} tweets scored. High-quality (≥6): ${highQualityCount}`);
    } catch (e: any) {
      log(`  Scoring failed: ${e.message} — using unscored tweets`);
      scoredTweets = newTweets.map((t) => ({
        ...t,
        score: 0,
        summary: "",
        tags: [],
      }));
    }
  } else if (options.skipScore) {
    log("[Phase 3] Skipping AI scoring (skipScore=true)");
    scoredTweets = newTweets.map((t) => ({
      ...t,
      score: 0,
      summary: "",
      tags: [],
    }));
  }

  // Phase 4: Store to DB
  let totalStored = 0;
  if (scoredTweets.length > 0) {
    log("[Phase 4] Storing tweets to DB...");
    try {
      totalStored = deps.storeTweets(scoredTweets);
      log(`  Stored ${totalStored} tweets`);
    } catch (e: any) {
      log(`  Store failed: ${e.message}`);
    }
  }

  // Phase 5: Generate report
  log("[Phase 5] Generating report...");
  const scoreMap = new Map<string, { score: number; summary: string; tags: string[] }>();
  for (const t of scoredTweets) {
    scoreMap.set(t.tweetId, { score: t.score, summary: t.summary, tags: t.tags });
  }

  const sorted = [...scoredTweets].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.likes + b.retweets * 3 - (a.likes + a.retweets * 3);
  });
  const topTweets = sorted.slice(0, 30);

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 16).replace("T", " ");
  const fileName = `search-scan-${now.toISOString().slice(2, 10).replace(/-/g, "")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;

  const keywordStats = new Map<string, number>();
  for (const t of newTweets) {
    keywordStats.set(t.keyword, (keywordStats.get(t.keyword) ?? 0) + 1);
  }
  const highQuality = scoredTweets.filter((t) => t.score >= 6);

  let report = `# Search Scan Report — ${dateStr}\n\n`;
  report += `## Summary\n`;
  report += `- Tabs scraped: ${tabCount}\n`;
  report += `- Total tweets: ${uniqueTweets.length}\n`;
  report += `- New (not in DB): ${newTweets.length}\n`;
  report += `- Scored ≥6: ${highQuality.length}\n`;
  report += `- Keywords: ${keywordStats.size}\n\n`;

  report += `## Keywords Breakdown\n`;
  report += `| Keyword | New Tweets |\n|---------|------------|\n`;
  for (const [kw, count] of keywordStats) {
    report += `| ${kw} | ${count} |\n`;
  }

  report += `\n## Top Tweets (by AI score + engagement)\n`;
  report += `| Score | Author | Tweet | Likes | RTs | Link |\n|-------|--------|-------|-------|-----|------|\n`;
  for (const t of topTweets) {
    const scoreStr = t.score > 0 ? String(t.score) : "-";
    const truncText =
      t.text.replace(/\n/g, " ").slice(0, 70) +
      (t.text.length > 70 ? "..." : "");
    report += `| ${scoreStr} | @${t.authorUsername} | ${truncText} | ${t.likes} | ${t.retweets} | [link](${t.url}) |\n`;
  }

  // Save report locally
  const reportDir = "/tmp/x-search-reports";
  mkdirSync(reportDir, { recursive: true });
  const reportPath = `${reportDir}/${fileName}.md`;
  writeFileSync(reportPath, report);
  log(`  Report saved: ${reportPath}`);

  // Phase 5b: Telegraph page
  let telegraphUrl = "";
  try {
    const telegraphHtml = [
      `<h3>Summary</h3>`,
      `<p>Tabs: ${tabCount} | Tweets: ${uniqueTweets.length} | New: ${newTweets.length} | High-quality: ${highQuality.length}</p>`,
      keywordStats.size > 0
        ? `<h3>Keywords</h3><p>${[...keywordStats].map(([kw, c]) => `${kw}: ${c}`).join(", ")}</p>`
        : "",
      topTweets.length > 0 ? `<h3>Top Tweets</h3>` : "",
      ...topTweets.slice(0, 15).map((t) => {
        const scoreStr = t.score > 0 ? `(${t.score}/10)` : "";
        const text = t.text.replace(/\n/g, " ").slice(0, 100);
        return `<p><b>@${t.authorUsername}</b> ${scoreStr} ${t.likes}❤️ — ${text} <a href="${t.url}">link</a></p>`;
      }),
    ]
      .filter(Boolean)
      .join("");

    const title = `Search Scan — ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const telegraphScript = "/Users/hd/x-watchdog/scripts/paperclip/telegraph-post.sh";
    telegraphUrl = postToTelegraph(title, telegraphHtml, telegraphScript);
    if (telegraphUrl) log(`  Telegraph: ${telegraphUrl}`);
  } catch (e: any) {
    log(`  Telegraph failed: ${e.message}`);
  }

  // Phase 6: TG notification
  log("[Phase 6] Sending Telegram notification...");
  if (deps.sendNotification) {
    try {
      const tgMessage = [
        `🔍 Search Scan Complete`,
        `${tabCount} tabs → ${uniqueTweets.length} tweets → ${newTweets.length} new`,
        highQuality.length
          ? `⭐ ${highQuality.length} high-quality (score ≥6)`
          : "",
        ``,
        topTweets
          .slice(0, 3)
          .map((t) => {
            const scoreStr = t.score > 0 ? `[${t.score}]` : "";
            return `• @${t.authorUsername} ${scoreStr} (${t.likes}❤️): ${t.text.slice(0, 60)}...`;
          })
          .join("\n"),
        ``,
        telegraphUrl
          ? `👉 Full report: ${telegraphUrl}`
          : `Report: ${fileName}.md`,
      ]
        .filter(Boolean)
        .join("\n");

      await deps.sendNotification(tgMessage);
      log(`  TG notification sent`);
    } catch (e: any) {
      log(`  TG notification failed: ${e.message}`);
    }
  } else {
    log("  No sendNotification callback provided, skipping");
  }

  // Phase 7: Signal detection — detect and create leads
  let leadsCreated = 0;
  if (scoredTweets.length > 0) {
    log("[Phase 7] Detecting leads from scored tweets...");
    try {
      leadsCreated = deps.detectAndCreateLeads(scoredTweets);
      log(`  ${leadsCreated} leads created`);
    } catch (e: any) {
      log(`  Lead detection failed: ${e.message}`);
    }
  }

  return {
    totalScraped: uniqueTweets.length,
    newTweets: newTweets.length,
    scored: scoredTweets.filter((t) => t.score > 0).length,
    stored: totalStored,
    leadsCreated,
    reportUrl: telegraphUrl || reportPath,
    errors,
  };
}
