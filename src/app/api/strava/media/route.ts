import { NextRequest, NextResponse } from "next/server";
import {
  getStravaClientId,
  isTokenExpired,
  refreshAccessToken,
  stravaApiBase,
  tokenBundleFromRequest,
  type StravaTokenBundle,
} from "@/lib/strava-server";

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

async function uploadActivityPhoto(accessToken: string, activityId: string, photo: File, caption: string) {
  const form = new FormData();
  form.append("file", photo, photo.name || `strava-photo-${Date.now()}.jpg`);
  if (caption.trim()) {
    form.append("description", caption.trim());
  }

  // This endpoint is inferred from Strava API references and may be restricted by app type.
  const response = await fetch(`${stravaApiBase()}/activities/${encodeURIComponent(activityId)}/upload_media`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: form,
  });

  const payload = (await response.json().catch(() => ({}))) as { message?: string; status?: string };
  return { response, payload };
}

export async function POST(request: NextRequest) {
  try {
    getStravaClientId();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Strava is not configured.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const formData = await request.formData();
  const activityId = String(formData.get("activityId") ?? "");
  const caption = String(formData.get("caption") ?? "");
  const photo = formData.get("photo");

  if (!activityId) {
    return NextResponse.json({ error: "Missing activityId." }, { status: 400 });
  }

  if (!(photo instanceof File)) {
    return NextResponse.json({ error: "Photo file is required." }, { status: 400 });
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

  let result = await uploadActivityPhoto(token.accessToken, activityId, photo, caption);
  if (result.response.status === 401) {
    try {
      refreshed = await refreshAccessToken(token.refreshToken);
      token = refreshed;
      result = await uploadActivityPhoto(token.accessToken, activityId, photo, caption);
    } catch {
      const response = NextResponse.json({ requiresAuth: true, error: "Strava session expired." }, { status: 401 });
      clearTokenCookies(response);
      return response;
    }
  }

  if (!result.response.ok) {
    return NextResponse.json(
      {
        error:
          result.payload.message ??
          result.payload.status ??
          "Photo upload is unavailable for this Strava app or account.",
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
