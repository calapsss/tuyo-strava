import type { NextRequest } from "next/server";

interface StravaTokenResponse {
  token_type: string;
  access_token: string;
  expires_at: number;
  expires_in: number;
  refresh_token: string;
  athlete?: unknown;
}

export interface StravaTokenBundle {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

const STRAVA_OAUTH_BASE = "https://www.strava.com/oauth";
const STRAVA_API_BASE = "https://www.strava.com/api/v3";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function stravaApiBase(): string {
  return STRAVA_API_BASE;
}

export function getStravaClientId(): string {
  return requiredEnv("STRAVA_CLIENT_ID");
}

function getStravaClientSecret(): string {
  return requiredEnv("STRAVA_CLIENT_SECRET");
}

export function getStravaRedirectUri(origin: string): string {
  return process.env.STRAVA_REDIRECT_URI ?? `${origin}/api/strava/callback`;
}

export function buildStravaAuthorizeUrl(origin: string, state?: string): string {
  const params = new URLSearchParams({
    client_id: getStravaClientId(),
    response_type: "code",
    redirect_uri: getStravaRedirectUri(origin),
    approval_prompt: "auto",
    scope: "activity:write",
  });

  if (state) {
    params.set("state", state);
  }

  return `${STRAVA_OAUTH_BASE}/authorize?${params.toString()}`;
}

async function exchangeToken(params: Record<string, string>): Promise<StravaTokenBundle> {
  const body = new URLSearchParams({
    client_id: getStravaClientId(),
    client_secret: getStravaClientSecret(),
    ...params,
  });

  const response = await fetch(`${STRAVA_OAUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const payload = (await response.json()) as Partial<StravaTokenResponse> & { message?: string };
  if (!response.ok || !payload.access_token || !payload.refresh_token || typeof payload.expires_at !== "number") {
    const message = payload.message ?? "Could not exchange Strava token.";
    throw new Error(message);
  }

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresAt: payload.expires_at,
  };
}

export async function exchangeAuthorizationCode(code: string): Promise<StravaTokenBundle> {
  return exchangeToken({
    grant_type: "authorization_code",
    code,
  });
}

export async function refreshAccessToken(refreshToken: string): Promise<StravaTokenBundle> {
  return exchangeToken({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
}

export function tokenBundleFromRequest(request: NextRequest): StravaTokenBundle | null {
  const accessToken = request.cookies.get("strava_access_token")?.value;
  const refreshToken = request.cookies.get("strava_refresh_token")?.value;
  const expiresAtRaw = request.cookies.get("strava_expires_at")?.value;
  const expiresAt = Number(expiresAtRaw);

  if (!accessToken || !refreshToken || !Number.isFinite(expiresAt)) {
    return null;
  }

  return {
    accessToken,
    refreshToken,
    expiresAt,
  };
}

export function isTokenExpired(expiresAt: number, skewSeconds = 60): boolean {
  return expiresAt - skewSeconds <= Math.floor(Date.now() / 1000);
}
