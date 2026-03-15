import { NextRequest, NextResponse } from "next/server";
import { exchangeAuthorizationCode } from "@/lib/strava-server";

interface CallbackState {
  redirectTo?: string;
}

function decodeState(state: string | null): CallbackState {
  if (!state) return {};
  try {
    const decoded = Buffer.from(state, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded) as CallbackState;
    return parsed ?? {};
  } catch {
    return {};
  }
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");
  const state = decodeState(request.nextUrl.searchParams.get("state"));
  const redirectTo = state.redirectTo && state.redirectTo.startsWith("/") ? state.redirectTo : "/";

  if (error) {
    const url = new URL(redirectTo, request.nextUrl.origin);
    url.searchParams.set("strava", "error");
    url.searchParams.set("reason", error);
    return NextResponse.redirect(url);
  }

  if (!code) {
    const url = new URL(redirectTo, request.nextUrl.origin);
    url.searchParams.set("strava", "error");
    url.searchParams.set("reason", "missing_code");
    return NextResponse.redirect(url);
  }

  try {
    const token = await exchangeAuthorizationCode(code);
    const url = new URL(redirectTo, request.nextUrl.origin);
    url.searchParams.set("strava", "connected");

    const response = NextResponse.redirect(url);
    const cookieOptions = {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      path: "/",
    };

    response.cookies.set("strava_access_token", token.accessToken, cookieOptions);
    response.cookies.set("strava_refresh_token", token.refreshToken, cookieOptions);
    response.cookies.set("strava_expires_at", String(token.expiresAt), cookieOptions);
    return response;
  } catch (exchangeError) {
    const message = exchangeError instanceof Error ? exchangeError.message : "token_exchange_failed";
    const url = new URL(redirectTo, request.nextUrl.origin);
    url.searchParams.set("strava", "error");
    url.searchParams.set("reason", message);
    return NextResponse.redirect(url);
  }
}
