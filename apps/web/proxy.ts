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
// avoids bouncing a request whose refresh token is still perfectly valid.
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
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
    return NextResponse.next();
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
    return (await response.json()) as AuthTokens;
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
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
