import { NextRequest, NextResponse } from "next/server";
import {
  buildStravaAuthorizeUrl,
  getStravaClientId,
  isTokenExpired,
  refreshAccessToken,
  stravaApiBase,
  tokenBundleFromRequest,
  type StravaTokenBundle,
} from "@/lib/strava-server";

interface UploadRequestBody {
  gpx?: string;
  name?: string;
  description?: string;
  activityType?: "run" | "walk" | "cycle";
  trainer?: boolean;
  commute?: boolean;
  hideFromHome?: boolean;
}

interface StravaUploadResponse {
  id?: number;
  id_str?: string;
  status?: string;
  error?: string;
  activity_id?: number | null;
}

function sportTypeForActivity(activityType: UploadRequestBody["activityType"]): string | null {
  if (activityType === "cycle") return "Ride";
  if (activityType === "walk") return "Walk";
  if (activityType === "run") return "Run";
  return null;
}

function redirectStateForRoot(): string {
  return Buffer.from(JSON.stringify({ redirectTo: "/" })).toString("base64url");
}

function unauthorized(request: NextRequest) {
  return NextResponse.json(
    {
      requiresAuth: true,
      authUrl: buildStravaAuthorizeUrl(request.nextUrl.origin, redirectStateForRoot()),
      message: "Login required for Strava upload.",
    },
    { status: 401 },
  );
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

async function uploadToStrava(accessToken: string, payload: UploadRequestBody) {
  const formData = new FormData();
  const gpx = payload.gpx ?? "";
  formData.append("data_type", "gpx");
  formData.append("file", new Blob([gpx], { type: "application/gpx+xml" }), `tuyo-${Date.now()}.gpx`);
  formData.append("external_id", `tuyo-${Date.now()}`);

  if (payload.name?.trim()) formData.append("name", payload.name.trim());
  if (payload.description?.trim()) formData.append("description", payload.description.trim());
  if (typeof payload.trainer === "boolean") formData.append("trainer", payload.trainer ? "true" : "false");
  if (typeof payload.commute === "boolean") formData.append("commute", payload.commute ? "true" : "false");
  const sportType = sportTypeForActivity(payload.activityType);
  if (sportType) formData.append("sport_type", sportType);

  const response = await fetch(`${stravaApiBase()}/uploads`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: formData,
  });

  const body = (await response.json().catch(() => ({}))) as StravaUploadResponse;
  return { response, body };
}

async function parsePayload(request: NextRequest): Promise<UploadRequestBody> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    return {
      gpx: String(formData.get("gpx") ?? ""),
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? ""),
      activityType: String(formData.get("activityType") ?? "") as UploadRequestBody["activityType"],
      trainer: String(formData.get("trainer") ?? "") === "true",
      commute: String(formData.get("commute") ?? "") === "true",
      hideFromHome: String(formData.get("hideFromHome") ?? "") === "true",
    };
  }

  return (await request.json().catch(() => ({}))) as UploadRequestBody;
}

export async function POST(request: NextRequest) {
  try {
    getStravaClientId();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Strava is not configured.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const payload = await parsePayload(request);
  if (!payload.gpx || payload.gpx.trim().length === 0) {
    return NextResponse.json({ error: "GPX payload is required." }, { status: 400 });
  }

  let token = tokenBundleFromRequest(request);
  if (!token) {
    return unauthorized(request);
  }

  let refreshed: StravaTokenBundle | null = null;
  if (isTokenExpired(token.expiresAt)) {
    try {
      refreshed = await refreshAccessToken(token.refreshToken);
      token = refreshed;
    } catch {
      const response = unauthorized(request);
      response.cookies.delete("strava_access_token");
      response.cookies.delete("strava_refresh_token");
      response.cookies.delete("strava_expires_at");
      return response;
    }
  }

  let upload = await uploadToStrava(token.accessToken, payload);
  if (upload.response.status === 401) {
    try {
      refreshed = await refreshAccessToken(token.refreshToken);
      token = refreshed;
      upload = await uploadToStrava(token.accessToken, payload);
    } catch {
      const response = unauthorized(request);
      response.cookies.delete("strava_access_token");
      response.cookies.delete("strava_refresh_token");
      response.cookies.delete("strava_expires_at");
      return response;
    }
  }

  if (!upload.response.ok) {
    const reason = upload.body.error ?? upload.body.status ?? "Strava upload failed.";
    const status = upload.response.status >= 400 ? upload.response.status : 502;
    return NextResponse.json({ error: reason }, { status });
  }

  const response = NextResponse.json({
    uploadId: upload.body.id,
    uploadStatus: upload.body.status ?? "Your file is being processed.",
    activityId: upload.body.activity_id ?? null,
    requestedHideFromHome: Boolean(payload.hideFromHome),
  });

  if (refreshed) {
    applyTokenCookies(response, refreshed);
  }

  return response;
}
