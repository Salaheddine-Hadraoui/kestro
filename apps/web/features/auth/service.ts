import "server-only";
import { env } from "../../lib/env";
import { apiFetch, SessionExpiredError } from "../../lib/server/api-client";
import { clearSessionCookies, getRefreshToken, setSessionCookies } from "../../lib/server/session";
import type { AuthTokens, PublicUser } from "../../lib/api/types";

export class InvalidCredentialsError extends Error {
  constructor() {
    super("Invalid email or password");
    this.name = "InvalidCredentialsError";
  }
}

export async function login(email: string, password: string): Promise<PublicUser> {
  const response = await fetch(`${env.apiUrl}/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    cache: "no-store",
  });

  if (response.status === 401) {
    throw new InvalidCredentialsError();
  }
  if (!response.ok) {
    throw new Error(`Login failed with status ${response.status}`);
  }

  const body = (await response.json()) as AuthTokens & { user: PublicUser };
  await setSessionCookies({ accessToken: body.accessToken, refreshToken: body.refreshToken });
  return body.user;
}

// Always clears the local session, even if the backend call fails or
// there is nothing to revoke -- logout must never leave stale cookies
// behind just because the network blipped. The backend's own logout is
// already idempotent (revoking an already-revoked token is a no-op).
export async function logout(): Promise<void> {
  const refreshToken = await getRefreshToken();
  if (refreshToken) {
    try {
      await fetch(`${env.apiUrl}/v1/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
        cache: "no-store",
      });
    } catch {
      // Best-effort revoke; local session is cleared unconditionally below.
    }
  }
  await clearSessionCookies();
}

export async function fetchCurrentUser(): Promise<PublicUser | null> {
  try {
    return await apiFetch<PublicUser>("/auth/me");
  } catch (error) {
    if (error instanceof SessionExpiredError) {
      return null;
    }
    throw error;
  }
}
