import { NextRequest, NextResponse } from "next/server";
import { buildStravaAuthorizeUrl } from "@/lib/strava-server";

export async function GET(request: NextRequest) {
  try {
    const redirectTo = request.nextUrl.searchParams.get("redirectTo") ?? "/";
    const state = Buffer.from(JSON.stringify({ redirectTo })).toString("base64url");
    const authUrl = buildStravaAuthorizeUrl(request.nextUrl.origin, state);
    return NextResponse.redirect(authUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not initialize Strava login.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
