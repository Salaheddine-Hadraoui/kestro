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
    const result = await refreshTokens(refreshToken);

    if (result.outcome === "success") {
      const response = isPublicPath(pathname)
        ? NextResponse.redirect(new URL("/", request.url))
        : NextResponse.next();
      setResponseCookies(response, result.tokens);
      return response;
    }

    if (result.outcome === "unavailable") {
      // A network failure talking to the backend is not the same thing
      // as the backend rejecting this refresh token. Destroying a
      // possibly-still-valid session because of a transient blip would
      // force-log-out every analyst mid-outage. Pass the request through
      // unmodified: if the API really is down, the page's own
      // verifySession() surfaces that honestly (Next's error boundary)
      // instead of silently ending the session.
      return NextResponse.next();
    }
    // result.outcome === "rejected": fall through -- the backend has
    // spoken, this refresh token is dead.
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

type RefreshResult =
  | { outcome: "success"; tokens: AuthTokens }
  | { outcome: "rejected" }
  | { outcome: "unavailable" };

// Concurrent requests (e.g. two open tabs) can both see the same expired
// access token and both attempt to refresh with the same, single-use
// refresh-token cookie. Without de-duplication the backend's rotation
// means only one succeeds, and the "loser" would delete the cookies the
// "winner" just set -- spuriously ending a session that was never
// actually invalid. Keying an in-flight-promise cache on the refresh
// token's own value, cleared as soon as each attempt settles, means
// concurrent requests carrying the same token share one backend call and
// one outcome instead of racing. This cache is scoped to this server
// process's memory; it doesn't coordinate across multiple server
// instances behind a load balancer, but that's the same scope every
// other piece of proxy.ts's in-memory state already has.
const inFlightRefreshes = new Map<string, Promise<RefreshResult>>();

function refreshTokens(refreshToken: string): Promise<RefreshResult> {
  const inFlight = inFlightRefreshes.get(refreshToken);
  if (inFlight) {
    return inFlight;
  }

  const attempt = performRefresh(refreshToken).finally(() => {
    inFlightRefreshes.delete(refreshToken);
  });
  inFlightRefreshes.set(refreshToken, attempt);
  return attempt;
}

async function performRefresh(refreshToken: string): Promise<RefreshResult> {
  let response: Response;
  try {
    response = await fetch(`${env.apiUrl}/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
      cache: "no-store",
    });
  } catch {
    return { outcome: "unavailable" };
  }

  if (!response.ok) {
    return { outcome: "rejected" };
  }

  try {
    const body = (await response.json()) as Partial<AuthTokens>;
    if (typeof body.accessToken !== "string" || typeof body.refreshToken !== "string") {
      return { outcome: "rejected" };
    }

    // Prove both tokens decode cleanly before treating the refresh as
    // successful -- setResponseCookies must never be able to throw.
    decodeJwtExpirySeconds(body.accessToken);
    decodeJwtExpirySeconds(body.refreshToken);

    return {
      outcome: "success",
      tokens: { accessToken: body.accessToken, refreshToken: body.refreshToken },
    };
  } catch {
    return { outcome: "rejected" };
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
