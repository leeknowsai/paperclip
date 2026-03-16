import type { PluginContext } from "@paperclipai/plugin-sdk";
import type { XWatchdogConfig } from "../worker.js";

export interface ResolvedConfig {
  xBearerToken: string;
  openaiApiKey: string;
  twitterApiIoKey?: string;
  xOAuthClientId?: string;
  xOAuthClientSecret?: string;
  notificationThreshold: number;
  maxFollowUps: number;
  followUpWaitHours: number;
  discordChannels: XWatchdogConfig["discordChannels"];
}

export async function resolveConfig(ctx: PluginContext): Promise<ResolvedConfig> {
  const raw = (await ctx.config.get()) as XWatchdogConfig;
  const xBearerToken = raw?.xBearerTokenRef ? await ctx.secrets.resolve(raw.xBearerTokenRef) : "";
  const openaiApiKey = raw?.openaiApiKeyRef ? await ctx.secrets.resolve(raw.openaiApiKeyRef) : "";
  const twitterApiIoKey = raw?.twitterApiIoKeyRef ? await ctx.secrets.resolve(raw.twitterApiIoKeyRef) : undefined;
  const xOAuthClientSecret = raw?.xOAuthClientSecretRef ? await ctx.secrets.resolve(raw.xOAuthClientSecretRef) : undefined;
  return {
    xBearerToken,
    openaiApiKey,
    twitterApiIoKey,
    xOAuthClientId: raw?.xOAuthClientId,
    xOAuthClientSecret,
    notificationThreshold: raw?.notificationThreshold ?? 7,
    maxFollowUps: raw?.maxFollowUps ?? 2,
    followUpWaitHours: raw?.followUpWaitHours ?? 48,
    discordChannels: raw?.discordChannels,
  };
}
