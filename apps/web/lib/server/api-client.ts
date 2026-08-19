import "server-only";
import { env } from "@/lib/env";
import { getAccessToken } from "./session";
import type { ApiErrorBody } from "@/lib/api/types";

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

// Calls the NestJS API as the current session, attaching the access
// token. Does NOT attempt to refresh an expired token itself: refresh
// happens proactively in proxy.ts, before a request ever reaches the
// Server Component code that calls this function -- Next.js forbids
// writing cookies during Server Component rendering, which is exactly
// where this is normally called from (features/auth/dal.ts's
// getCurrentUser()). A 401 here means the session is genuinely invalid
// by the time the request reached this code.
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new SessionExpiredError();
  }

  const response = await fetch(`${env.apiUrl}/v1${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (response.status === 401) {
    throw new SessionExpiredError();
  }

  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorMessage(response));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}
