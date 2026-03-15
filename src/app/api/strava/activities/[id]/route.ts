import { NextRequest, NextResponse } from "next/server";
import {
  getStravaClientId,
  isTokenExpired,
  refreshAccessToken,
  stravaApiBase,
  tokenBundleFromRequest,
  type StravaTokenBundle,
} from "@/lib/strava-server";

interface UpdateActivityBody {
  hideFromHome?: boolean;
}

function applyTokenCookies(response: NextResponse, token: StravaTokenBundle) {
  const cookieOptions = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };
  response.cookies.set("strava_access_token", token.accessToken, cookieOptions);
  response.cookies.set("strava_refresh_token", token.refreshToken, cookieOptions);
  response.cookies.set("strava_expires_at", String(token.expiresAt), cookieOptions);
}

function clearTokenCookies(response: NextResponse) {
  response.cookies.delete("strava_access_token");
  response.cookies.delete("strava_refresh_token");
  response.cookies.delete("strava_expires_at");
}

async function updateActivity(accessToken: string, activityId: string, body: UpdateActivityBody) {
  const form = new URLSearchParams();
  if (typeof body.hideFromHome === "boolean") {
    form.set("hide_from_home", body.hideFromHome ? "true" : "false");
  }

  const response = await fetch(`${stravaApiBase()}/activities/${encodeURIComponent(activityId)}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form,
  });

  const payload = (await response.json().catch(() => ({}))) as { message?: string };
  return { response, payload };
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    getStravaClientId();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Strava is not configured.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as UpdateActivityBody;
  if (!id) {
    return NextResponse.json({ error: "Missing activity id." }, { status: 400 });
  }

  let token = tokenBundleFromRequest(request);
  if (!token) {
    return NextResponse.json({ requiresAuth: true, error: "Not connected to Strava." }, { status: 401 });
  }

  let refreshed: StravaTokenBundle | null = null;
  if (isTokenExpired(token.expiresAt)) {
    try {
      refreshed = await refreshAccessToken(token.refreshToken);
      token = refreshed;
    } catch {
      const response = NextResponse.json({ requiresAuth: true, error: "Strava session expired." }, { status: 401 });
      clearTokenCookies(response);
      return response;
    }
  }

  let result = await updateActivity(token.accessToken, id, body);
  if (result.response.status === 401) {
    try {
      refreshed = await refreshAccessToken(token.refreshToken);
      token = refreshed;
      result = await updateActivity(token.accessToken, id, body);
    } catch {
      const response = NextResponse.json({ requiresAuth: true, error: "Strava session expired." }, { status: 401 });
      clearTokenCookies(response);
      return response;
    }
  }

  if (!result.response.ok) {
    return NextResponse.json(
      {
        error: result.payload.message ?? "Could not update Strava activity.",
      },
      { status: result.response.status },
    );
  }

  const response = NextResponse.json({ ok: true });
  if (refreshed) {
    applyTokenCookies(response, refreshed);
  }
  return response;
}
