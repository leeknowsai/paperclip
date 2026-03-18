// Process outreach jobs: dequeue pending analysis jobs, run AI outreach strategy,
// store results, emit outreach-ready event.
// Ported from /src/worker/cron/process-outreach-jobs.ts in the CF worker.
import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { analysisJobs, outreachAnalyses, outreachActions } from "../db/schema.js";
import { fetchTweetAnalysisData } from "../lib/tweet-analyzer.js";
import { generateOutreachStrategy } from "../lib/outreach-ai.js";
import { getAvailableProviders, createLlmClient } from "../lib/llm-providers.js";
import { resolveConfig } from "../lib/config.js";
import { EVENT_NAMES } from "../constants.js";
function generateId() {
    return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
export async function handleProcessOutreach(ctx) {
    const cfg = await resolveConfig(ctx);
    if (!cfg.xBearerToken) {
        ctx.logger.warn("[process-outreach] No X bearer token configured, skipping");
        return;
    }
    if (!cfg.openaiApiKey) {
        ctx.logger.warn("[process-outreach] No LLM API key configured, skipping");
        return;
    }
    const db = getDb();
    // Process one job at a time to stay within CPU limits
    const job = db
        .select()
        .from(analysisJobs)
        .where(eq(analysisJobs.status, "pending"))
        .limit(1)
        .get();
    if (!job) {
        ctx.logger.info("[process-outreach] No pending jobs");
        return;
    }
    ctx.logger.info(`[process-outreach] Processing job ${job.id} for tweet ${job.tweetId}`);
    db.update(analysisJobs)
        .set({ status: "processing" })
        .where(eq(analysisJobs.id, job.id))
        .run();
    try {
        // 1. Fetch tweet data
        const analysisData = await fetchTweetAnalysisData(job.tweetId, cfg.xBearerToken);
        if (!analysisData) {
            await markJobFailed(ctx, job, "Tweet not found or deleted");
            return;
        }
        // 2. Get project scoring prompt if available
        let scoringPrompt;
        if (job.projectId) {
            const { projects } = await import("../db/schema.js");
            const project = db
                .select({ scoringPrompt: projects.scoringPrompt })
                .from(projects)
                .where(eq(projects.id, job.projectId))
                .get();
            scoringPrompt = project?.scoringPrompt ?? undefined;
        }
        // 3. Build LLM client (use first available provider)
        const apiKeys = {};
        if (cfg.openaiApiKey)
            apiKeys["OPENAI_API_KEY"] = cfg.openaiApiKey;
        const providers = getAvailableProviders(apiKeys);
        if (!providers.length) {
            await markJobFailed(ctx, job, "No LLM providers available");
            return;
        }
        const providerCfg = providers[0];
        const llmClient = createLlmClient(apiKeys, providerCfg.id, providerCfg.models[0].id);
        // 4. Generate outreach strategy
        const result = await generateOutreachStrategy(llmClient, analysisData, scoringPrompt);
        if (!result) {
            await markJobFailed(ctx, job, "AI generation failed");
            return;
        }
        // 5. Store analysis
        const analysisId = generateId();
        db.insert(outreachAnalyses).values({
            id: analysisId,
            jobId: job.id,
            tweetId: job.tweetId,
            projectId: job.projectId,
            tweetData: JSON.stringify({
                author: analysisData.tweet.authorUsername,
                authorName: analysisData.tweet.authorName,
                content: analysisData.tweet.text,
                metrics: analysisData.tweet.metrics,
                authorFollowers: analysisData.tweet.authorFollowers,
            }),
            conversation: JSON.stringify(analysisData.topReplies.map((r) => ({
                author: r.authorUsername,
                text: r.text,
                likes: r.metrics.likes,
                followers: r.authorFollowers,
            }))),
            aiResult: JSON.stringify(result),
            aiModel: `${providerCfg.id}/${providerCfg.models[0].id}`,
            priority: result.priority,
            score: result.opportunityScore,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        }).run();
        // 6. Create initial outreach action
        const actionId = generateId();
        db.insert(outreachActions).values({
            id: actionId,
            analysisId,
            assignee: null,
            status: "new",
            notes: "[]",
            followUpAt: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        }).run();
        // 6b. Emit approval-needed event before outreach is sent
        try {
            const topDraft = result.tweetAuthor.suggestedMessages[0]?.text ??
                result.publicReply.variants[0]?.text ?? "";
            await ctx.events.emit(EVENT_NAMES.approvalNeeded, "", {
                leadId: actionId,
                handle: analysisData.tweet.authorUsername,
                channel: "x_reply",
                draftMessage: topDraft,
                reason: "Outreach requires approval",
            });
        }
        catch (emitErr) {
            ctx.logger.error(`[process-outreach] approval-needed event emit failed: ${emitErr}`);
        }
        // 7. Emit outreach-ready event (replaces TG notification from CF worker)
        try {
            const topReply = result.publicReply.variants[0]?.text ??
                result.tweetAuthor.suggestedMessages[0]?.text ??
                "";
            await ctx.events.emit(EVENT_NAMES.outreachReady, "", {
                analysisId,
                jobId: job.id,
                tweetId: job.tweetId,
                projectId: job.projectId,
                author: analysisData.tweet.authorUsername,
                opportunityScore: result.opportunityScore,
                priority: result.priority,
                summary: result.summary,
                suggestedReply: topReply,
                keyTargets: result.keyCommenters.slice(0, 3).map((c) => c.handle),
            });
        }
        catch (emitErr) {
            ctx.logger.error(`[process-outreach] Event emit failed: ${emitErr}`);
        }
        // 8. Mark completed
        db.update(analysisJobs)
            .set({ status: "completed", completedAt: new Date().toISOString() })
            .where(eq(analysisJobs.id, job.id))
            .run();
        ctx.logger.info(`[process-outreach] Job ${job.id} completed (score=${result.opportunityScore}, priority=${result.priority})`);
    }
    catch (err) {
        ctx.logger.error(`[process-outreach] Job ${job.id} failed: ${err}`);
        await markJobFailed(ctx, job, err instanceof Error ? err.message : "Unknown error");
    }
}
async function markJobFailed(ctx, job, reason) {
    const db = getDb();
    db.update(analysisJobs)
        .set({ status: "failed", completedAt: new Date().toISOString() })
        .where(eq(analysisJobs.id, job.id))
        .run();
    ctx.logger.warn(`[process-outreach] Job ${job.id} marked failed: ${reason}`);
    try {
        await ctx.events.emit(EVENT_NAMES.error, "", {
            source: "process-outreach",
            jobId: job.id,
            tweetId: job.tweetId,
            reason,
        });
    }
    catch { /* non-critical */ }
}
//# sourceMappingURL=process-outreach.js.map