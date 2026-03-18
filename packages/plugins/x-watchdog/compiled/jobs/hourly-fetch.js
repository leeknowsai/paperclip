// Hourly-fetch job: fetch tweets, score with AI, detect leads, emit events.
// Ported from /src/worker/cron/index.ts + detect-leads.ts in the CF worker.
import { and, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { handles, tweets, projects, projectHandles, leads, } from "../db/schema.js";
import { buildSearchQueries, searchRecentTweets } from "../lib/x-api.js";
import { createTwitterApiIoProvider } from "../lib/x-provider-twitterapiio.js";
import { scoreTweetBatch } from "../lib/ai-scorer.js";
import { detectSignals } from "../lib/signal-detector.js";
import { parseChannelsFromBio, toChannelsAvailable, } from "../lib/lead-enrichment.js";
import { buildContextPackPrompt, parseContextPack, } from "../lib/context-pack.js";
import { getAvailableProviders, createLlmClient } from "../lib/llm-providers.js";
import { getDbConfig, setDbConfig } from "../lib/db-config.js";
import { chunk } from "../lib/utils.js";
import { resolveConfig } from "../lib/config.js";
import { EVENT_NAMES } from "../constants.js";
import OpenAI from "openai";
function toXTweet(t) {
    return { id: t.id, text: t.text, author_id: t.authorId, created_at: t.createdAt };
}
function safeParseJson(json) {
    if (!json)
        return null;
    try {
        return JSON.parse(json);
    }
    catch {
        return null;
    }
}
export async function handleHourlyFetch(ctx, companyId = "") {
    const cfg = await resolveConfig(ctx);
    if (!cfg.xBearerToken) {
        ctx.logger.warn("[hourly-fetch] No X bearer token configured, skipping");
        return;
    }
    const db = getDb();
    const minute = new Date().getMinutes();
    const batchGroup = minute % 10;
    ctx.logger.info(`[hourly-fetch] batch=${batchGroup} minute=${minute}`);
    const batchHandles = db
        .select()
        .from(handles)
        .where(and(eq(handles.active, true), eq(handles.batchGroup, batchGroup)))
        .all();
    ctx.logger.info(`[hourly-fetch] handles in batch: ${batchHandles.length}`);
    const allTweets = [];
    // Handle-based search
    if (batchHandles.length) {
        const lastSeenId = await getDbConfig(db, `lastSeen_batch_${batchGroup}`);
        ctx.logger.info(`[hourly-fetch] lastSeenId: ${lastSeenId ?? "null (first run)"}`);
        const queries = buildSearchQueries(batchHandles.map((h) => h.username));
        ctx.logger.info(`[hourly-fetch] queries: ${queries.length}`);
        const twitterApiIo = cfg.twitterApiIoKey
            ? createTwitterApiIoProvider(cfg.twitterApiIoKey)
            : null;
        for (const query of queries) {
            try {
                const result = await searchRecentTweets(query, lastSeenId, cfg.xBearerToken);
                if (result.length === 0 && twitterApiIo) {
                    ctx.logger.info(`[hourly-fetch] X API empty for query, trying TwitterAPI.io fallback`);
                    const fallback = await twitterApiIo.searchTweets(query);
                    allTweets.push(...fallback.tweets.map(toXTweet));
                }
                else {
                    allTweets.push(...result);
                }
                ctx.logger.info(`[hourly-fetch] query got ${result.length} tweets`);
            }
            catch (err) {
                ctx.logger.error(`[hourly-fetch] X API search failed, trying fallback: ${err}`);
                if (twitterApiIo) {
                    try {
                        const fallback = await twitterApiIo.searchTweets(query);
                        allTweets.push(...fallback.tweets.map(toXTweet));
                        ctx.logger.info(`[hourly-fetch] fallback got ${fallback.tweets.length} tweets`);
                    }
                    catch (fallbackErr) {
                        ctx.logger.error(`[hourly-fetch] TwitterAPI.io fallback also failed: ${fallbackErr}`);
                    }
                }
            }
        }
        // Backfill new handles via TwitterAPI.io (first fetch gets recent tweets)
        if (twitterApiIo) {
            const backfillKey = `backfilled_handles`;
            const backfilledJson = await getDbConfig(db, backfillKey);
            const backfilledSet = new Set(backfilledJson ? JSON.parse(backfilledJson) : []);
            const newHandles = batchHandles.filter((h) => !backfilledSet.has(h.id));
            const toBackfill = newHandles.slice(0, 5);
            for (const handle of toBackfill) {
                try {
                    const result = await twitterApiIo.getUserTimeline(handle.username);
                    allTweets.push(...result.tweets.map(toXTweet));
                    backfilledSet.add(handle.id);
                    ctx.logger.info(`[hourly-fetch] backfilled @${handle.username}: ${result.tweets.length} tweets`);
                }
                catch (err) {
                    ctx.logger.error(`[hourly-fetch] backfill failed for @${handle.username}: ${err}`);
                }
            }
            if (toBackfill.length) {
                await setDbConfig(db, backfillKey, JSON.stringify([...backfilledSet]));
            }
        }
    }
    // Keyword-based search (catch mentions from any account)
    const keywordsJson = await getDbConfig(db, "search_keywords");
    if (keywordsJson) {
        try {
            const keywords = JSON.parse(keywordsJson);
            const kwLastSeen = await getDbConfig(db, "lastSeen_keywords");
            for (const kw of keywords) {
                try {
                    const result = await searchRecentTweets(kw, kwLastSeen, cfg.xBearerToken);
                    allTweets.push(...result);
                }
                catch (err) {
                    ctx.logger.error(`[hourly-fetch] Keyword search failed: ${kw}: ${err}`);
                }
            }
        }
        catch {
            ctx.logger.error("[hourly-fetch] Failed to parse search_keywords config");
        }
    }
    ctx.logger.info(`[hourly-fetch] total tweets fetched: ${allTweets.length}`);
    if (!allTweets.length)
        return;
    // Dedup within fetched tweets
    const seen = new Set();
    const dedupedAll = allTweets.filter((t) => {
        if (seen.has(t.id))
            return false;
        seen.add(t.id);
        return true;
    });
    // Dedup against DB (batch to avoid SQL variable limit)
    const existingIds = new Set();
    for (const idBatch of chunk(dedupedAll.map((t) => t.id), 30)) {
        const rows = db
            .select({ id: tweets.id })
            .from(tweets)
            .where(inArray(tweets.id, idBatch))
            .all();
        rows.forEach((r) => existingIds.add(r.id));
    }
    const newTweets = dedupedAll.filter((t) => !existingIds.has(t.id));
    if (!newTweets.length)
        return;
    // Ensure all tweet authors exist in handles table
    const authorIds = [...new Set(newTweets.map((t) => t.author_id))];
    const existingHandleIds = new Set();
    for (const idBatch of chunk(authorIds, 30)) {
        const rows = db
            .select({ id: handles.id })
            .from(handles)
            .where(inArray(handles.id, idBatch))
            .all();
        rows.forEach((r) => existingHandleIds.add(r.id));
    }
    const missingAuthorIds = authorIds.filter((id) => !existingHandleIds.has(id));
    if (missingAuthorIds.length) {
        const countResult = db
            .select({ c: sql `count(*)` })
            .from(handles)
            .get();
        let handleCount = countResult?.c ?? 0;
        for (const batch of chunk(missingAuthorIds, 10)) {
            db.insert(handles)
                .values(batch.map((id) => ({
                id,
                username: `user_${id}`,
                category: null,
                batchGroup: handleCount++ % 10,
                addedAt: new Date(),
                active: true,
                updatedAt: new Date(),
            })))
                .onConflictDoNothing()
                .run();
        }
    }
    // Insert raw tweets (batch to avoid SQL variable limit)
    for (const batch of chunk(newTweets, 10)) {
        db.insert(tweets)
            .values(batch.map((t) => ({
            id: t.id,
            handleId: t.author_id,
            content: t.text,
            createdAt: new Date(t.created_at),
            fetchedAt: new Date(),
            aiScore: null,
            aiSummary: null,
            aiTags: null,
            notified: false,
            updatedAt: new Date(),
        })))
            .onConflictDoNothing()
            .run();
    }
    // Update last seen IDs
    const maxId = newTweets.reduce((max, t) => (t.id > max ? t.id : max), "0");
    if (batchHandles.length) {
        await setDbConfig(db, `lastSeen_batch_${batchGroup}`, maxId);
    }
    if (keywordsJson) {
        await setDbConfig(db, "lastSeen_keywords", maxId);
    }
    ctx.logger.info(`[hourly-fetch] inserted ${newTweets.length} new tweets`);
    // AI scoring
    if (cfg.openaiApiKey) {
        try {
            const openai = new OpenAI({ apiKey: cfg.openaiApiKey });
            const unscoredTweets = db
                .select({ id: tweets.id, content: tweets.content, handleId: tweets.handleId })
                .from(tweets)
                .where(isNull(tweets.aiScore))
                .limit(50)
                .all();
            const allHandles = db.select().from(handles).all();
            const handleMap = new Map(allHandles.map((h) => [h.id, h]));
            // Build combined scoring prompt from global + project prompts
            const globalPrompt = await getDbConfig(db, "scoring_prompt");
            const handleIds = [...new Set(unscoredTweets.map((t) => t.handleId))];
            const projectPrompts = [];
            for (const idBatch of chunk(handleIds, 30)) {
                const rows = db
                    .selectDistinct({ prompt: projects.scoringPrompt })
                    .from(projectHandles)
                    .innerJoin(projects, eq(projectHandles.projectId, projects.id))
                    .where(inArray(projectHandles.handleId, idBatch))
                    .all();
                projectPrompts.push(...rows);
            }
            const combinedPrompt = [globalPrompt, ...projectPrompts.map((r) => r.prompt).filter((p) => !!p)]
                .filter(Boolean)
                .join("\n\n") || undefined;
            for (const batch of chunk(unscoredTweets, 10)) {
                try {
                    const enriched = batch.map((t) => ({
                        id: t.id,
                        content: t.content,
                        username: handleMap.get(t.handleId)?.username ?? "unknown",
                        category: handleMap.get(t.handleId)?.category ?? null,
                    }));
                    const scores = await scoreTweetBatch(openai, enriched, combinedPrompt);
                    for (const s of scores) {
                        db.update(tweets)
                            .set({
                            aiScore: s.score / 10,
                            aiSummary: s.summary,
                            aiTags: JSON.stringify(s.tags),
                            updatedAt: new Date(),
                        })
                            .where(eq(tweets.id, s.tweetId))
                            .run();
                    }
                }
                catch (err) {
                    ctx.logger.error(`[hourly-fetch] AI scoring batch failed: ${err}`);
                }
            }
            // Emit high-score events for newly scored tweets above threshold
            const notificationThreshold = 0.7;
            for (const batch of chunk(unscoredTweets, 30)) {
                const scoredIds = batch.map((t) => t.id);
                const highScored = db
                    .select({ id: tweets.id, content: tweets.content, handleId: tweets.handleId, aiScore: tweets.aiScore, aiSummary: tweets.aiSummary })
                    .from(tweets)
                    .where(and(inArray(tweets.id, scoredIds), gte(tweets.aiScore, notificationThreshold)))
                    .all();
                for (const tweet of highScored) {
                    const handle = handleMap.get(tweet.handleId);
                    // Find which project this handle belongs to
                    const phRow = db
                        .select({ projectId: projectHandles.projectId })
                        .from(projectHandles)
                        .where(eq(projectHandles.handleId, tweet.handleId))
                        .limit(1)
                        .get();
                    try {
                        await ctx.events.emit(EVENT_NAMES.highScore, companyId, {
                            handle: handle?.username ?? "unknown",
                            score: tweet.aiScore,
                            tweetId: tweet.id,
                            summary: tweet.aiSummary,
                            projectId: phRow?.projectId ?? null,
                        });
                    }
                    catch (emitErr) {
                        ctx.logger.error(`[hourly-fetch] high-score event emit failed: ${emitErr}`);
                    }
                }
            }
            ctx.logger.info(`[hourly-fetch] AI scoring complete for ${unscoredTweets.length} tweets`);
        }
        catch (err) {
            ctx.logger.error(`[hourly-fetch] AI scoring setup failed: ${err}`);
        }
    }
    // Proactive lead detection
    try {
        await detectLeads(ctx, cfg, companyId);
    }
    catch (err) {
        ctx.logger.error(`[hourly-fetch] Lead detection failed: ${err}`);
    }
}
/** Detect BD leads from recently scored tweets. */
async function detectLeads(ctx, cfg, companyId) {
    const db = getDb();
    const allProjects = db
        .select()
        .from(projects)
        .where(eq(projects.active, true))
        .all();
    const projectConfigs = allProjects
        .filter((p) => p.triggerKeywords)
        .map((p) => ({
        id: p.id,
        name: p.name,
        triggerKeywords: safeParseJson(p.triggerKeywords),
        scoringPrompt: p.scoringPrompt,
        outreachChannels: safeParseJson(p.outreachChannels),
        outreachTemplates: safeParseJson(p.outreachTemplates),
        projectDocs: p.projectDocs,
        tgTopicId: p.tgTopicId,
    }));
    if (!projectConfigs.length) {
        ctx.logger.info("[detect-leads] No projects with trigger keywords, skipping");
        return;
    }
    // Get recently scored high-score tweets not yet checked
    const lastCheckedId = await getDbConfig(db, "leads_last_checked_tweet_id");
    const recentlyScored = db
        .select({
        id: tweets.id,
        content: tweets.content,
        handleId: tweets.handleId,
        aiScore: tweets.aiScore,
    })
        .from(tweets)
        .where(and(sql `${tweets.aiScore} IS NOT NULL`, gte(tweets.aiScore, 0.6), lastCheckedId ? sql `${tweets.id} > ${lastCheckedId}` : sql `1=1`))
        .orderBy(tweets.id)
        .limit(50)
        .all();
    ctx.logger.info(`[detect-leads] ${recentlyScored.length} high-score tweets to check`);
    if (!recentlyScored.length)
        return;
    // Build handle map
    const handleIds = [...new Set(recentlyScored.map((t) => t.handleId))];
    const handleRows = [];
    for (const batch of chunk(handleIds, 30)) {
        const rows = db
            .select({ id: handles.id, username: handles.username })
            .from(handles)
            .where(inArray(handles.id, batch))
            .all();
        handleRows.push(...rows);
    }
    const handleMap = new Map(handleRows.map((h) => [h.id, h.username]));
    const scoredTweets = recentlyScored.map((t) => ({
        id: t.id,
        content: t.content ?? "",
        handleId: t.handleId,
        username: handleMap.get(t.handleId) ?? "unknown",
        aiScore: t.aiScore ?? 0,
    }));
    const signals = detectSignals(scoredTweets, projectConfigs);
    ctx.logger.info(`[detect-leads] ${signals.length} signals detected`);
    if (!signals.length) {
        const maxId = recentlyScored[recentlyScored.length - 1].id;
        await setDbConfig(db, "leads_last_checked_tweet_id", maxId);
        return;
    }
    // Dedup against existing leads
    const existingLeads = new Set();
    for (const batch of chunk(signals, 30)) {
        const rows = db
            .select({ handle: leads.handle, projectId: leads.projectId, tweetId: leads.tweetId })
            .from(leads)
            .where(inArray(leads.tweetId, batch.map((s) => s.tweet.id)))
            .all();
        rows.forEach((r) => existingLeads.add(`${r.handle}:${r.projectId}:${r.tweetId}`));
    }
    const newSignals = signals.filter((s) => !existingLeads.has(`${s.tweet.username}:${s.project.id}:${s.tweet.id}`));
    if (!newSignals.length) {
        const maxId = recentlyScored[recentlyScored.length - 1].id;
        await setDbConfig(db, "leads_last_checked_tweet_id", maxId);
        return;
    }
    // Get LLM client
    const apiKeys = {};
    if (cfg.openaiApiKey)
        apiKeys["OPENAI_API_KEY"] = cfg.openaiApiKey;
    const providers = getAvailableProviders(apiKeys);
    if (!providers.length) {
        ctx.logger.error("[detect-leads] No LLM providers available");
        return;
    }
    const providerCfg = providers[0];
    const llmClient = createLlmClient(apiKeys, providerCfg.id, providerCfg.models[0].id);
    // Process signals (limit to 2 per run to stay within budget)
    const toProcess = newSignals.slice(0, 2);
    const twitterApiIo = cfg.twitterApiIoKey
        ? createTwitterApiIoProvider(cfg.twitterApiIoKey)
        : null;
    for (const signal of toProcess) {
        try {
            let bio = null;
            let followers = null;
            let externalUrl = null;
            if (twitterApiIo) {
                const profile = await twitterApiIo.lookupUser(signal.tweet.username);
                if (profile) {
                    bio = profile.bio;
                    followers = profile.followersCount;
                    externalUrl = profile.website;
                }
            }
            const channels = parseChannelsFromBio(bio ?? "", externalUrl);
            const channelsAvailable = toChannelsAvailable(channels);
            const enabledChannels = signal.project.outreachChannels ?? ["x_dm"];
            const availableChannels = enabledChannels.filter((ch) => channelsAvailable[ch] !== false);
            const prompt = buildContextPackPrompt({
                tweetText: signal.tweet.content,
                handle: signal.tweet.username,
                followers,
                bio,
                projectName: signal.project.name,
                projectDocs: signal.project.projectDocs,
                outreachTemplates: signal.project.outreachTemplates,
                availableChannels,
            });
            const aiResponse = await llmClient.chatCompletion({
                systemPrompt: "You are a crypto BD strategist. Generate context packs for outreach leads.",
                userMessage: prompt,
                temperature: 0.2,
                maxTokens: 1000,
                jsonMode: true,
            });
            if (!aiResponse) {
                ctx.logger.error(`[detect-leads] LLM returned null for @${signal.tweet.username}`);
                continue;
            }
            const contextPack = parseContextPack(aiResponse);
            if (!contextPack) {
                ctx.logger.error(`[detect-leads] Failed to parse context pack for @${signal.tweet.username}`);
                continue;
            }
            const leadId = `lead_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            const now = new Date();
            db.insert(leads)
                .values({
                id: leadId,
                projectId: signal.project.id,
                handle: signal.tweet.username,
                tweetId: signal.tweet.id,
                signalType: contextPack.signal_type,
                contextPack: JSON.stringify(contextPack),
                status: "new",
                urgency: contextPack.urgency,
                channelsAvailable: JSON.stringify(channelsAvailable),
                draftedMessages: JSON.stringify(contextPack.drafted_messages),
                sentChannels: null,
                bdNotes: null,
                createdAt: now,
                updatedAt: now,
            })
                .run();
            ctx.logger.info(`[detect-leads] Created lead: @${signal.tweet.username} → ${signal.project.name} (${contextPack.urgency}, ${contextPack.signal_type})`);
            // Emit event for new lead
            try {
                await ctx.events.emit(EVENT_NAMES.newLead, companyId, {
                    leadId,
                    handle: signal.tweet.username,
                    projectId: signal.project.id,
                    projectName: signal.project.name,
                    signalType: contextPack.signal_type,
                    urgency: contextPack.urgency,
                    tweetText: signal.tweet.content,
                    bdAngle: contextPack.bd_angle,
                    draftMessage: contextPack.drafted_messages?.x_dm ?? contextPack.suggested_action,
                });
            }
            catch (emitErr) {
                ctx.logger.error(`[detect-leads] Event emit failed: ${emitErr}`);
            }
        }
        catch (err) {
            ctx.logger.error(`[detect-leads] Error processing signal for @${signal.tweet.username}: ${err}`);
        }
    }
    if (toProcess.length >= newSignals.length) {
        const maxId = recentlyScored[recentlyScored.length - 1].id;
        await setDbConfig(db, "leads_last_checked_tweet_id", maxId);
        ctx.logger.info(`[detect-leads] Checkpoint advanced to ${maxId}`);
    }
    else {
        ctx.logger.info(`[detect-leads] ${newSignals.length - toProcess.length} signals remaining, checkpoint NOT advanced`);
    }
}
//# sourceMappingURL=hourly-fetch.js.map