import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "@/lib/server/cookie-names";
import { isPublicPath } from "@/lib/server/protected-paths";
import { isTokenValid } from "@/lib/server/token-validity";
import { decodeJwtExpirySeconds } from "@/lib/server/jwt";
import { buildCookieOptions } from "@/lib/server/session";
import type { AuthTokens } from "@/lib/api/types";

// Optimistic, but no longer presence-only: this decodes the access
// token's own "exp" claim (no signature verification -- NestJS already
// did that) to catch an expired-but-still-present cookie, and
// proactively refreshes via NestJS before deciding a request is
// logged-out. This has to live here, not in apiFetch/a Server Component:
// Next.js forbids writing cookies during Server Component rendering, and
// refresh necessarily writes new cookies. verifySession() (calling
// NestJS /auth/me) remains the only authoritative check; this proxy only
// avoids bouncing a request whose refresh token is still perfectly
// valid. The one case this exp-only check can't catch -- a token that
// looks unexpired but the backend rejects anyway -- is handled by
// app/session-expired/route.ts, reached via verifySession()'s redirect.
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/session-expired") {
    return NextResponse.next();
  }

  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value;

  if (isTokenValid(accessToken)) {
    return isPublicPath(pathname)
      ? NextResponse.redirect(new URL("/", request.url))
      : NextResponse.next();
  }

  if (refreshToken) {
    const refreshed = await refreshTokens(refreshToken);
    if (refreshed) {
      const response = isPublicPath(pathname)
        ? NextResponse.redirect(new URL("/", request.url))
        : NextResponse.next();
      setResponseCookies(response, refreshed);
      return response;
    }
  }

  if (isPublicPath(pathname)) {
    // Visiting /login directly always gets a clean slate: clear any
    // stale/dead cookies rather than leaving them to trigger another
    // doomed refresh attempt on the next load.
    const response = NextResponse.next();
    response.cookies.delete(ACCESS_TOKEN_COOKIE);
    response.cookies.delete(REFRESH_TOKEN_COOKIE);
    return response;
  }

  const response = NextResponse.redirect(new URL("/login", request.url));
  response.cookies.delete(ACCESS_TOKEN_COOKIE);
  response.cookies.delete(REFRESH_TOKEN_COOKIE);
  return response;
}

async function refreshTokens(refreshToken: string): Promise<AuthTokens | null> {
  try {
    const response = await fetch(`${env.apiUrl}/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
      cache: "no-store",
    });
    if (!response.ok) {
      return null;
    }

    const body = (await response.json()) as Partial<AuthTokens>;
    if (typeof body.accessToken !== "string" || typeof body.refreshToken !== "string") {
      return null;
    }

    // Prove both tokens decode cleanly before treating the refresh as
    // successful -- setResponseCookies must never be able to throw.
    decodeJwtExpirySeconds(body.accessToken);
    decodeJwtExpirySeconds(body.refreshToken);

    return { accessToken: body.accessToken, refreshToken: body.refreshToken };
  } catch {
    return null;
  }
}

function setResponseCookies(response: NextResponse, tokens: AuthTokens): void {
  response.cookies.set(
    ACCESS_TOKEN_COOKIE,
    tokens.accessToken,
    buildCookieOptions(decodeJwtExpirySeconds(tokens.accessToken)),
  );
  response.cookies.set(
    REFRESH_TOKEN_COOKIE,
    tokens.refreshToken,
    buildCookieOptions(decodeJwtExpirySeconds(tokens.refreshToken)),
  );
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
