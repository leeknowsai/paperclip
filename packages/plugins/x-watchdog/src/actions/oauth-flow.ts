/**
 * OAuth 2.0 PKCE flow for X (Twitter).
 *
 * - Action "initiate-oauth": generates PKCE verifier + authorize URL, stores state in ctx.state.
 * - handleOAuthCallback: exchanges code for tokens, fetches user info, stores tokens.
 *
 * Ported from x-watchdog/src/worker/api/oauth.ts.
 */

import type { PluginContext, PluginWebhookInput } from "@paperclipai/plugin-sdk";
import { STATE_KEYS } from "../constants.js";
import { resolveConfig } from "../lib/config.js";
import type { OAuthTokenData } from "../lib/oauth-utils.js";

const AUTHORIZE_URL = "https://x.com/i/oauth2/authorize";
const TOKEN_URL = "https://api.x.com/2/oauth2/token";
const SCOPES = "tweet.read tweet.write dm.read dm.write users.read offline.access";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a random hex string (PKCE verifier / state nonce). */
function randomHex(bytes = 32): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** SHA-256 → base64url (PKCE code_challenge). */
async function sha256Base64url(plain: string): Promise<string> {
  const encoded = new TextEncoder().encode(plain);
  const hash = await crypto.subtle.digest("SHA-256", encoded);
  const b64 = btoa(String.fromCharCode(...new Uint8Array(hash)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ---------------------------------------------------------------------------
// Action: initiate-oauth
// Called from UI settings page to start the OAuth flow.
// ---------------------------------------------------------------------------

export async function initiateOAuth(
  ctx: PluginContext,
  params: Record<string, unknown>,
): Promise<{ authUrl: string }> {
  const config = await resolveConfig(ctx);
  const clientId = config.xOAuthClientId;
  if (!clientId) {
    throw new Error("xOAuthClientId is not configured — set it in plugin settings.");
  }

  // Derive callback URL from params or use a default
  const callbackUrl =
    (params.callbackUrl as string | undefined) ??
    "https://api-watchdog.clawfriend.ai/oauth/callback";

  const stateNonce = randomHex(16);
  const codeVerifier = randomHex(32);
  const codeChallenge = await sha256Base64url(codeVerifier);

  // Store PKCE state
  await ctx.state.set(STATE_KEYS.oauthPkce(stateNonce), {
    codeVerifier,
    callbackUrl,
    createdAt: Math.floor(Date.now() / 1000),
  });

  const queryParams = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: callbackUrl,
    scope: SCOPES,
    state: stateNonce,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  const authUrl = `${AUTHORIZE_URL}?${queryParams}`;
  ctx.logger.info(`[oauth-flow] Authorize URL generated for state=${stateNonce}`);

  return { authUrl };
}

// ---------------------------------------------------------------------------
// Webhook handler: oauth-callback
// Called by the Paperclip host when X redirects to the webhook endpoint.
// Query params (code, state, error) are expected in parsedBody or rawBody.
// ---------------------------------------------------------------------------

export async function handleOAuthCallback(
  ctx: PluginContext,
  input: PluginWebhookInput,
): Promise<void> {
  // Extract code and state — host may pass them as parsedBody (object) or
  // rawBody (query string format for GET requests).
  let code: string | undefined;
  let state: string | undefined;
  let error: string | undefined;

  const parsed = input.parsedBody as Record<string, unknown> | undefined;
  if (parsed && typeof parsed === "object") {
    code = parsed.code as string | undefined;
    state = parsed.state as string | undefined;
    error = parsed.error as string | undefined;
  }

  // Fall back to rawBody as query string
  if (!code && input.rawBody) {
    try {
      const qs = new URLSearchParams(input.rawBody);
      code = qs.get("code") ?? undefined;
      state = qs.get("state") ?? undefined;
      error = qs.get("error") ?? undefined;
    } catch {
      // not a query string — ignore
    }
  }

  if (error) {
    ctx.logger.warn(`[oauth-callback] Authorization denied: ${error}`);
    return;
  }

  if (!code || !state) {
    ctx.logger.error("[oauth-callback] Missing code or state in callback", {
      rawBody: input.rawBody?.slice(0, 200),
    });
    return;
  }

  // Retrieve stored PKCE data
  const pkceRaw = await ctx.state.get(STATE_KEYS.oauthPkce(state));
  if (!pkceRaw) {
    ctx.logger.error(`[oauth-callback] No PKCE state found for nonce=${state}`);
    return;
  }

  const pkce =
    typeof pkceRaw === "string"
      ? (JSON.parse(pkceRaw) as { codeVerifier: string; callbackUrl: string })
      : (pkceRaw as { codeVerifier: string; callbackUrl: string });

  const config = await resolveConfig(ctx);
  const clientId = config.xOAuthClientId;
  const clientSecret = config.xOAuthClientSecret;

  if (!clientId || !clientSecret) {
    ctx.logger.error("[oauth-callback] xOAuthClientId or xOAuthClientSecret not configured");
    return;
  }

  // Exchange code for tokens
  const basicAuth = btoa(`${clientId}:${clientSecret}`);
  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      code,
      grant_type: "authorization_code",
      redirect_uri: pkce.callbackUrl,
      code_verifier: pkce.codeVerifier,
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    ctx.logger.error(`[oauth-callback] Token exchange failed (${tokenRes.status}): ${err}`);
    return;
  }

  const tokenData = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
    token_type: string;
  };

  // Fetch user info to identify the account
  const userRes = await fetch("https://api.x.com/2/users/me", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  if (!userRes.ok) {
    ctx.logger.error(`[oauth-callback] User info fetch failed: ${await userRes.text()}`);
    return;
  }

  const userData = (await userRes.json()) as {
    data: { id: string; username: string; name: string };
  };
  const { id: userId, username, name } = userData.data;
  const now = Math.floor(Date.now() / 1000);

  const tokenPayload: OAuthTokenData = {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    expiresAt: now + tokenData.expires_in,
    scope: tokenData.scope,
    userId,
    username,
  };

  // Store token keyed by username
  await ctx.state.set(STATE_KEYS.oauthToken(username), tokenPayload);

  // Update accounts registry (deduped list)
  const accountsRaw = await ctx.state.get(STATE_KEYS.oauthAccounts);
  const accounts: string[] = accountsRaw
    ? (accountsRaw as string[])
    : [];
  if (!accounts.includes(username)) {
    accounts.push(username);
    await ctx.state.set(STATE_KEYS.oauthAccounts, accounts);
  }

  // Cleanup PKCE state
  await ctx.state.delete(STATE_KEYS.oauthPkce(state));

  ctx.logger.info(
    `[oauth-callback] Tokens stored for @${username} (${name}, id=${userId}). ` +
      `Expires in ${Math.round(tokenData.expires_in / 3600)}h. ` +
      `Scopes: ${tokenData.scope}`,
  );
}
