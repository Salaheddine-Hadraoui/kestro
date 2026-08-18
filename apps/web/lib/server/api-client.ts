import "server-only";
import { env } from "@/lib/env";
import {
  clearSessionCookies,
  getAccessToken,
  getRefreshToken,
  setSessionCookies,
} from "./session";
import type { ApiErrorBody, AuthTokens } from "@/lib/api/types";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class SessionExpiredError extends Error {
  constructor() {
    super("Session expired or invalid");
    this.name = "SessionExpiredError";
  }
}

async function parseErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as ApiErrorBody;
    return Array.isArray(body.message) ? body.message.join(", ") : body.message;
  } catch {
    return response.statusText || "Request failed";
  }
}

function callBackend(
  path: string,
  init: RequestInit,
  accessToken: string | undefined,
): Promise<Response> {
  return fetch(`${env.apiUrl}/v1${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });
}

// Rotates the refresh token against NestJS's single-use contract
// (Auth module hardening pass): a successful call always returns a new
// pair, which replaces both cookies. A failed call (expired/revoked/
// already-rotated refresh token) clears the local session -- there is no
// partial-failure state to represent.
export async function refreshSession(): Promise<boolean> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) {
    return false;
  }

  const response = await fetch(`${env.apiUrl}/v1/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
    cache: "no-store",
  });

  if (!response.ok) {
    await clearSessionCookies();
    return false;
  }

  const tokens = (await response.json()) as AuthTokens;
  await setSessionCookies(tokens);
  return true;
}

// Calls the NestJS API as the current session. On a 401 (expired/invalid
// access token) attempts exactly one refresh-and-retry -- a second 401
// after a successful refresh, or a failed refresh, both mean the session
// is genuinely over, not worth retrying further.
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new SessionExpiredError();
  }

  let response = await callBackend(path, init, accessToken);

  if (response.status === 401) {
    const refreshed = await refreshSession();
    if (!refreshed) {
      throw new SessionExpiredError();
    }
    const newAccessToken = await getAccessToken();
    response = await callBackend(path, init, newAccessToken);
    if (response.status === 401) {
      await clearSessionCookies();
      throw new SessionExpiredError();
    }
  }

  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorMessage(response));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}
