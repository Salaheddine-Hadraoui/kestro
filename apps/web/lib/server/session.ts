import "server-only";
import { cookies } from "next/headers";
import { decodeJwtExpirySeconds } from "./jwt";
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "./cookie-names";
import type { AuthTokens } from "@/lib/api/types";

export { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE };

interface SessionCookieOptions {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  maxAge: number;
}

// Both cookies use path "/": Next.js only sees whatever cookies the
// browser attached to the request for whatever route is currently being
// rendered. This design refreshes transparently, server-side, during the
// render of an ordinary page (e.g. "/" or a future "/cases/123") -- there
// is no separate browser-initiated request to a narrower "refresh" path
// for a scoped cookie to attach to. Scoping the refresh cookie's path more
// narrowly would silently break refresh on every normal page load.
export function buildCookieOptions(expiresAtSeconds: number): SessionCookieOptions {
  const maxAge = Math.max(0, Math.floor(expiresAtSeconds - Date.now() / 1000));
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge,
  };
}

export async function setSessionCookies(tokens: AuthTokens): Promise<void> {
  const store = await cookies();
  store.set(
    ACCESS_TOKEN_COOKIE,
    tokens.accessToken,
    buildCookieOptions(decodeJwtExpirySeconds(tokens.accessToken)),
  );
  store.set(
    REFRESH_TOKEN_COOKIE,
    tokens.refreshToken,
    buildCookieOptions(decodeJwtExpirySeconds(tokens.refreshToken)),
  );
}

export async function clearSessionCookies(): Promise<void> {
  const store = await cookies();
  store.delete(ACCESS_TOKEN_COOKIE);
  store.delete(REFRESH_TOKEN_COOKIE);
}

export async function getAccessToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(ACCESS_TOKEN_COOKIE)?.value;
}

export async function getRefreshToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(REFRESH_TOKEN_COOKIE)?.value;
}
