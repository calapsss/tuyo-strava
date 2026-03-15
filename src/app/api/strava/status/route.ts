import { NextRequest, NextResponse } from "next/server";
import {
  buildStravaAuthorizeUrl,
  getStravaClientId,
  isTokenExpired,
  refreshAccessToken,
  tokenBundleFromRequest,
} from "@/lib/strava-server";

export async function GET(request: NextRequest) {
  try {
    getStravaClientId();
  } catch {
    return NextResponse.json({ configured: false, connected: false });
  }

  const token = tokenBundleFromRequest(request);
  if (!token) {
    return NextResponse.json({
      configured: true,
      connected: false,
      authUrl: buildStravaAuthorizeUrl(request.nextUrl.origin, Buffer.from(JSON.stringify({ redirectTo: "/" })).toString("base64url")),
    });
  }

  if (!isTokenExpired(token.expiresAt)) {
    return NextResponse.json({ configured: true, connected: true });
  }

  try {
    const refreshed = await refreshAccessToken(token.refreshToken);
    const response = NextResponse.json({ configured: true, connected: true });
    const cookieOptions = {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      path: "/",
    };
    response.cookies.set("strava_access_token", refreshed.accessToken, cookieOptions);
    response.cookies.set("strava_refresh_token", refreshed.refreshToken, cookieOptions);
    response.cookies.set("strava_expires_at", String(refreshed.expiresAt), cookieOptions);
    return response;
  } catch {
    const response = NextResponse.json({
      configured: true,
      connected: false,
      authUrl: buildStravaAuthorizeUrl(request.nextUrl.origin, Buffer.from(JSON.stringify({ redirectTo: "/" })).toString("base64url")),
    });
    response.cookies.delete("strava_access_token");
    response.cookies.delete("strava_refresh_token");
    response.cookies.delete("strava_expires_at");
    return response;
  }
}
