import { NextRequest, NextResponse } from "next/server";
import {
  getStravaClientId,
  isTokenExpired,
  refreshAccessToken,
  stravaApiBase,
  tokenBundleFromRequest,
  type StravaTokenBundle,
} from "@/lib/strava-server";

interface StravaUploadStatusResponse {
  id?: number;
  status?: string;
  error?: string;
  activity_id?: number | null;
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

async function getUploadStatus(uploadId: string, accessToken: string) {
  const response = await fetch(`${stravaApiBase()}/uploads/${encodeURIComponent(uploadId)}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const body = (await response.json().catch(() => ({}))) as StravaUploadStatusResponse;
  return { response, body };
}

export async function GET(
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
  if (!id) {
    return NextResponse.json({ error: "Missing upload id." }, { status: 400 });
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

  let upload = await getUploadStatus(id, token.accessToken);
  if (upload.response.status === 401) {
    try {
      refreshed = await refreshAccessToken(token.refreshToken);
      token = refreshed;
      upload = await getUploadStatus(id, token.accessToken);
    } catch {
      const response = NextResponse.json({ requiresAuth: true, error: "Strava session expired." }, { status: 401 });
      clearTokenCookies(response);
      return response;
    }
  }

  if (!upload.response.ok) {
    const reason = upload.body.error ?? upload.body.status ?? "Could not fetch upload status.";
    return NextResponse.json({ error: reason }, { status: upload.response.status });
  }

  const response = NextResponse.json({
    uploadId: upload.body.id,
    uploadStatus: upload.body.status ?? "Processing",
    activityId: upload.body.activity_id ?? null,
    complete: Boolean(upload.body.activity_id) || /ready/i.test(upload.body.status ?? ""),
  });

  if (refreshed) {
    applyTokenCookies(response, refreshed);
  }

  return response;
}
