import type { PluginContext } from "@paperclipai/plugin-sdk";
import { STATE_KEYS } from "../constants.js";

export interface OAuthTokenData {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  scope?: string;
  userId?: string;
  username: string;
}

/** Get the first connected OAuth token. Throws if none connected or expired. */
export async function getOAuthToken(
  ctx: PluginContext,
): Promise<{ accessToken: string; username: string }> {
  const accountsRaw = await ctx.state.get(STATE_KEYS.oauthAccounts);
  const accounts: string[] = accountsRaw
    ? (accountsRaw as string[])
    : [];
  if (!accounts.length) throw new Error("No OAuth account connected.");

  const username = accounts[0];
  const dataRaw = await ctx.state.get(STATE_KEYS.oauthToken(username));
  if (!dataRaw) {
    throw new Error(
      `OAuth token for @${username} not found. Re-authenticate via Settings.`,
    );
  }

  const data: OAuthTokenData =
    typeof dataRaw === "string" ? JSON.parse(dataRaw) : (dataRaw as OAuthTokenData);

  if (data.expiresAt && data.expiresAt < Date.now() / 1000) {
    throw new Error(
      `OAuth token for @${username} expired. Re-authenticate via Settings.`,
    );
  }

  return { accessToken: data.accessToken, username: data.username ?? username };
}
