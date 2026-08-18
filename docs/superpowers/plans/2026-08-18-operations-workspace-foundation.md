# Operations Workspace Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Phase 2 — Milestone 1 of Kestro's Operations Workspace: a Next.js app shell with real authentication (login/logout), a Next.js BFF boundary that holds JWTs in httpOnly cookies (never exposed to browser JS), protected workspace routing, a typed server-side API client with refresh-and-retry, a role-aware navigation foundation, and a loading/error/empty-state foundation. No Alerts/Cases/Dashboard/Investigation/Evidence/Timeline UI in this milestone.

**Architecture:** All calls to the NestJS API (`http://localhost:3001/v1/...`) happen server-side from Next.js (Server Components, Server Actions, and one `proxy.ts`), never from the browser. Two httpOnly cookies (`kestro_access_token`, `kestro_refresh_token`) carry the JWT pair. Shared BFF plumbing (cookie read/write, the typed API client with refresh-and-retry) lives in `lib/server/` since every future feature will reuse it unchanged; the Auth *feature* itself (login/logout/current-user, and its Data Access Layer) lives in `features/auth/`, establishing the feature-oriented structure the rest of Phase 2 will extend (`features/alerts/`, `features/cases/`, ...). `proxy.ts` does a cheap, optimistic cookie-presence redirect; the DAL's `verifySession()` (which calls NestJS `/auth/me`) is the only authoritative check, matching "the frontend must never be a security boundary."

**Tech Stack:** Next.js 16.3 (App Router, React 19.2), TypeScript, Tailwind CSS v4, Jest + React Testing Library (already configured). One new dependency: `server-only`.

**Spec:** This plan implements the user's "Phase 2 — Milestone 1: Operations Workspace Foundation" request (see conversation) plus the prior read-only "Phase 2 Operations Workspace architecture review" turn it builds on. No separate spec file exists; this plan's Global Constraints section below is the spec, copied from the request.

## Global Constraints

- Kestro is a professional SOC operations product, not merely a CRUD frontend.
- Frontend and backend evolve together around the analyst workflow; do not redesign already-settled backend architecture (Auth module's JSON-token contract, `/v1` prefix, DTOs) without evidence of an actual defect.
- The frontend must never be a security boundary — all authorization is enforced server-side by NestJS. Anything client-visible (nav items, redirects) is UX only.
- Browser JavaScript must never receive or store access/refresh tokens. No token in `localStorage`, `sessionStorage`, a non-httpOnly cookie, or any JSON response body sent to the browser.
- The Next.js server (Server Components, Server Actions, `proxy.ts`) may hold tokens in httpOnly cookies and call the NestJS API server-side.
- No Redux, Zustand, OpenAPI generator, WebSockets, event bus, or unnecessary abstractions. No client-side state library — Next.js server rendering + `useActionState` covers this milestone.
- Keep it simple, explicit, testable, and scalable — one thin module per responsibility, not a framework. Establish the feature-oriented structure (`features/auth/`, ready for `features/alerts/`, `features/cases/`, ... later) rather than a generic catch-all.
- Do not implement Alerts UI, Cases UI, Dashboard, Investigation UI, Evidence UI, or Timeline UI.
- No secrets in `NEXT_PUBLIC_*` variables. `NEXT_PUBLIC_API_URL` (already defined) is not a secret — it's a base URL — and continues to be the only env var this milestone needs; no new env vars are introduced.
- Existing backend (through commit `b616883`) is not modified. It is called exactly as documented: `POST /v1/auth/login` returns `{accessToken, refreshToken, user}` in the JSON body; `POST /v1/auth/refresh` takes `{refreshToken}` and returns a new `{accessToken, refreshToken}` pair (rotating, single-use); `POST /v1/auth/logout` takes `{refreshToken}` and is idempotent; `GET /v1/auth/me` requires `Authorization: Bearer <accessToken>` and returns the current `PublicUser`.

## Key architectural decisions (context for every task below)

1. **Next.js 16 uses `proxy.ts` at the project root, not `middleware.ts`** — `middleware.js` is deprecated and renamed in this version (confirmed via `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`, since `apps/web/AGENTS.md` warns this Next.js version has real breaking changes from training-data assumptions). The exported function is named `proxy` (default or named export), configured with `export const config = { matcher: [...] }`.
2. **`cookies()` from `next/headers` is async in this Next.js version** — every call site uses `await cookies()`.
3. **Both cookies use `path: "/"`, not a narrower path for the refresh cookie.** A narrower path (e.g. `/api/auth`) was considered for the refresh cookie as defense-in-depth, but rejected: cookie path scoping is enforced by the *browser* deciding what to attach to its own top-level navigation request, and this design's refresh happens transparently, server-side, during the render of whatever page the user is already navigating to (e.g. `/` or `/cases/123`) — not via a dedicated browser-initiated `/api/auth/refresh` call. A narrow path would mean the browser never sends the refresh cookie on an ordinary page load, silently breaking refresh. Both cookies are `httpOnly: true`, `secure: process.env.NODE_ENV === "production"`, `sameSite: "lax"`.
4. **Cookie `maxAge` is derived from each JWT's own `exp` claim**, not a hardcoded duration guessed to match the backend's `JWT_ACCESS_EXPIRES_IN`/`JWT_REFRESH_EXPIRES_IN` env vars (which the frontend has no access to and shouldn't duplicate). A ~10-line unsigned base64url decode of the JWT payload reads `exp`; this is not a trust decision (NestJS already verified the signature when issuing the token) — it's just reading the token's own metadata to size a cookie correctly and avoid drift.
5. **Login/logout are Next.js Server Actions, not hand-rolled Route Handlers** — this matches Next's own recommended authentication pattern (`node_modules/next/dist/docs/01-app/02-guides/authentication.md`) and satisfies "avoid unnecessary abstractions": a form's `action` prop calling a `"use server"` function is simpler than a fetch-based JSON endpoint, and Server Actions already execute server-side (are "the BFF"), same trust boundary as a Route Handler.
6. **Reactive (401-triggered), not proactive/scheduled, token refresh.** `apiFetch` attaches the access token, and on a 401 attempts exactly one refresh-and-retry (matching the backend's single-use refresh-token contract — a second 401 means the session is genuinely over, not worth retrying). No background timer/scheduler.
7. **The experimental `unauthorized()`/`forbidden()` Next.js APIs and `authInterrupts` config flag are not used.** They require opting into an experimental flag; the standard, stable `redirect()`-based pattern from Next's own authentication guide is simpler and sufficient for this milestone.
8. **`app/page.tsx` (the old technical-foundation health-check demo) and `components/layout/header.tsx` (the old static header) are replaced, not kept alongside the new workspace.** Both were explicitly self-documented placeholders ("Business features... are not implemented yet" / "Navigation placeholder... not part of the technical foundation stage") whose entire job was proving the app shell worked before real features existed. `app/(workspace)/page.tsx` now owns the `/` route (Next.js does not allow two pages resolving to the same path), and `app/(workspace)/workspace-header.tsx` supersedes the static header with a role-aware one. This is called out explicitly (not a silent deletion) because it touches existing scaffold files.
9. **Feature-oriented split**: `lib/server/` holds BFF plumbing that every future feature reuses unchanged (cookie helpers, the typed `apiFetch` client, the JWT-expiry helper) — this is infrastructure, not a feature. `features/auth/` holds the Auth feature's own logic (`service.ts`: login/logout/fetchCurrentUser; `dal.ts`: verifySession) — the first of what will become `features/alerts/`, `features/cases/`, etc. in later milestones, matching the architecture review's agreed structure. `lib/nav.ts` is shared cross-feature shell data (every feature will eventually register a nav entry), not part of any one feature.
10. **Known limitation carried into the next milestone, not solved here:** `getCurrentUser` is memoized per-request via React's `cache()`, so this milestone's single `/auth/me` call per page is safe. Once a later milestone renders a page that fires several parallel `apiFetch` calls in one request (e.g. a case workspace's Timeline/Evidence/Investigation tabs), an expired access token could trigger *concurrent* refresh attempts racing the backend's single-use refresh-token rotation — one wins, the other(s) get a hard 401 even though the session is valid. A request-scoped single-flight de-dupe on `refreshSession()` is the fix; not needed while this milestone has only one `apiFetch` call per render, so it is deliberately not built now (YAGNI) but must be picked up before any multi-fetch page ships.

---

### Task 1: Update docs/PROGRESS.md with the Phase 2 plan (pre-implementation)

**Files:**
- Modify: `docs/PROGRESS.md`

**Interfaces:** None (documentation only).

- [ ] **Step 1: Add a "Phase 2 — Operations Workspace" section**

Insert a new section after the existing "## Hypothesis ↔ Evidence milestone" section (before "## Key architectural/domain decisions already made"), with this content:

```markdown
## Phase 2 — Operations Workspace

Phase 2 moves Kestro from a backend-only API (Milestone 1 + Phase 1's
Investigations/Hypothesis-Evidence, all complete through commit `b616883`)
into an actually-usable product. A read-only architecture review (see
conversation history — not a committed doc) evaluated search/filter, case
export, richer metrics, and remaining B-tier hardening against the
alternative of building the frontend first, and concluded the frontend is
the higher-value next step: none of the other candidates have any value
without a UI to consume them.

**Phase 2 — Milestone 1: Operations Workspace Foundation** (this milestone)
builds the app shell only: Next.js authentication UI, a Next.js
BFF/authentication boundary holding JWTs in httpOnly cookies (never exposed
to browser JavaScript), protected workspace routing, a typed server-side
API client with 401-triggered refresh-and-retry, a role-aware navigation
foundation, and a loading/error/empty-state foundation. It deliberately
does **not** implement Alerts, Cases, Dashboard, Investigation, Evidence,
or Timeline UI — those are later Phase 2 milestones, sequenced onto this
foundation once it exists.

No backend changes: the existing Auth module's JSON-token contract
(`POST /v1/auth/login|refresh|logout`, `GET /v1/auth/me`) is called exactly
as built. See "Key architectural/domain decisions already made" below for
the frontend-side decisions this milestone makes (cookie strategy, Server
Actions vs. Route Handlers, feature-oriented folder structure, etc.), added
once implementation completes.
```

- [ ] **Step 2: Leave "Next planned milestone" and "Current task" untouched for now**

The existing backend-focused "Next planned milestone" text still accurately describes the backend candidates that were deferred in favor of the frontend — don't edit it here. Task 10 updates "Current task" and adds the full implementation summary once the milestone is actually done.

---

### Task 2: Shared API types + JWT expiry helper

**Files:**
- Create: `apps/web/lib/api/types.ts`
- Create: `apps/web/lib/server/jwt.ts`
- Test: `apps/web/lib/server/jwt.test.ts`
- Modify: `apps/web/package.json` (add `server-only` dependency)

**Interfaces:**
- Produces: `PublicUser`, `UserRole`, `AuthTokens`, `ApiErrorBody` (types, from `@/lib/api/types`); `decodeJwtExpirySeconds(token: string): number` (from `@/lib/server/jwt`, throws `Error` on a malformed token).

- [ ] **Step 1: Add the `server-only` dependency**

Run: `cd apps/web && npm install server-only`

- [ ] **Step 2: Create the shared API types**

```ts
// apps/web/lib/api/types.ts
export type UserRole = "analyst" | "lead";

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  disabledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface ApiErrorBody {
  statusCode: number;
  message: string | string[];
  timestamp?: string;
  path?: string;
}
```

- [ ] **Step 3: Write the failing test for the JWT expiry helper**

```ts
// apps/web/lib/server/jwt.test.ts
import { decodeJwtExpirySeconds } from "./jwt";

function makeFakeJwt(payload: Record<string, unknown>): string {
  const base64url = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj)).toString("base64url");
  return `${base64url({ alg: "HS256", typ: "JWT" })}.${base64url(payload)}.fake-signature`;
}

describe("decodeJwtExpirySeconds", () => {
  it("reads the numeric exp claim from a well-formed token", () => {
    const token = makeFakeJwt({ sub: "user-1", exp: 1_800_000_000 });
    expect(decodeJwtExpirySeconds(token)).toBe(1_800_000_000);
  });

  it("throws on a token that isn't three dot-separated segments", () => {
    expect(() => decodeJwtExpirySeconds("not-a-jwt")).toThrow(/three segments/);
  });

  it("throws when the payload has no numeric exp claim", () => {
    const token = makeFakeJwt({ sub: "user-1" });
    expect(() => decodeJwtExpirySeconds(token)).toThrow(/exp/);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `cd apps/web && npx jest lib/server/jwt.test.ts`
Expected: FAIL — `Cannot find module './jwt'`

- [ ] **Step 5: Implement the JWT expiry helper**

```ts
// apps/web/lib/server/jwt.ts
import "server-only";

// Reads the "exp" claim from a JWT's payload without verifying its
// signature. This is not a trust decision -- NestJS already verified the
// token when it issued it. This only reads the token's own metadata to
// size a cookie's maxAge correctly, instead of duplicating a guessed TTL
// the frontend has no access to (JWT_ACCESS_EXPIRES_IN/JWT_REFRESH_EXPIRES_IN
// are backend-only env vars).
export function decodeJwtExpirySeconds(token: string): number {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Malformed JWT: expected three segments");
  }

  const payloadJson = Buffer.from(parts[1], "base64url").toString("utf8");
  const payload: unknown = JSON.parse(payloadJson);

  if (
    typeof payload !== "object" ||
    payload === null ||
    typeof (payload as { exp?: unknown }).exp !== "number"
  ) {
    throw new Error('Malformed JWT: missing numeric "exp" claim');
  }

  return (payload as { exp: number }).exp;
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd apps/web && npx jest lib/server/jwt.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 7: Commit**

```bash
git add apps/web/package.json apps/web/package-lock.json apps/web/lib/api/types.ts apps/web/lib/server/jwt.ts apps/web/lib/server/jwt.test.ts
git commit -m "feat(web): add shared API types and JWT expiry helper"
```

---

### Task 3: Session cookie helpers

**Files:**
- Create: `apps/web/lib/server/cookie-names.ts`
- Create: `apps/web/lib/server/session.ts`
- Test: `apps/web/lib/server/session.test.ts`

**Interfaces:**
- Consumes: `decodeJwtExpirySeconds` (Task 2), `AuthTokens` type (Task 2).
- Produces: `ACCESS_TOKEN_COOKIE`, `REFRESH_TOKEN_COOKIE` (string constants, from `@/lib/server/cookie-names` — kept in their own file, no `server-only` guard, so `proxy.ts` in Task 6 can import just the names without pulling in cookie-writing logic); `buildCookieOptions(expiresAtSeconds: number): {httpOnly, secure, sameSite, path, maxAge}`, `setSessionCookies(tokens: AuthTokens): Promise<void>`, `clearSessionCookies(): Promise<void>`, `getAccessToken(): Promise<string | undefined>`, `getRefreshToken(): Promise<string | undefined>` (all from `@/lib/server/session`).

- [ ] **Step 1: Create the cookie name constants**

```ts
// apps/web/lib/server/cookie-names.ts
export const ACCESS_TOKEN_COOKIE = "kestro_access_token";
export const REFRESH_TOKEN_COOKIE = "kestro_refresh_token";
```

- [ ] **Step 2: Write the failing tests**

```ts
// apps/web/lib/server/session.test.ts
import { cookies } from "next/headers";

jest.mock("next/headers", () => ({
  cookies: jest.fn(),
}));

import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  buildCookieOptions,
  setSessionCookies,
  clearSessionCookies,
  getAccessToken,
  getRefreshToken,
} from "./session";

function makeFakeJwt(exp: number): string {
  const base64url = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj)).toString("base64url");
  return `${base64url({ alg: "HS256" })}.${base64url({ exp })}.sig`;
}

describe("buildCookieOptions", () => {
  const REAL_NODE_ENV = process.env.NODE_ENV;

  afterEach(() => {
    jest.useRealTimers();
    process.env.NODE_ENV = REAL_NODE_ENV;
  });

  it("computes maxAge as seconds remaining until expiry", () => {
    jest.useFakeTimers().setSystemTime(new Date(1_000_000 * 1000));
    const options = buildCookieOptions(1_000_300);
    expect(options.maxAge).toBe(300);
    expect(options.path).toBe("/");
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe("lax");
  });

  it("floors maxAge at 0 for an already-expired timestamp", () => {
    jest.useFakeTimers().setSystemTime(new Date(1_000_000 * 1000));
    expect(buildCookieOptions(500).maxAge).toBe(0);
  });

  it("is only secure in production", () => {
    process.env.NODE_ENV = "production";
    expect(buildCookieOptions(Date.now() / 1000 + 60).secure).toBe(true);
    process.env.NODE_ENV = "development";
    expect(buildCookieOptions(Date.now() / 1000 + 60).secure).toBe(false);
  });
});

describe("session cookie read/write", () => {
  it("sets both cookies with the token-derived expiry", async () => {
    const store = { set: jest.fn(), delete: jest.fn(), get: jest.fn() };
    (cookies as jest.Mock).mockResolvedValue(store);

    const accessToken = makeFakeJwt(Math.floor(Date.now() / 1000) + 900);
    const refreshToken = makeFakeJwt(Math.floor(Date.now() / 1000) + 2_592_000);

    await setSessionCookies({ accessToken, refreshToken });

    expect(store.set).toHaveBeenCalledWith(
      ACCESS_TOKEN_COOKIE,
      accessToken,
      expect.objectContaining({ path: "/", httpOnly: true }),
    );
    expect(store.set).toHaveBeenCalledWith(
      REFRESH_TOKEN_COOKIE,
      refreshToken,
      expect.objectContaining({ path: "/", httpOnly: true }),
    );
  });

  it("clears both cookies", async () => {
    const store = { set: jest.fn(), delete: jest.fn(), get: jest.fn() };
    (cookies as jest.Mock).mockResolvedValue(store);

    await clearSessionCookies();

    expect(store.delete).toHaveBeenCalledWith(ACCESS_TOKEN_COOKIE);
    expect(store.delete).toHaveBeenCalledWith(REFRESH_TOKEN_COOKIE);
  });

  it("reads the access and refresh tokens", async () => {
    const store = {
      set: jest.fn(),
      delete: jest.fn(),
      get: jest.fn((name: string) =>
        name === ACCESS_TOKEN_COOKIE ? { value: "access-value" } : { value: "refresh-value" },
      ),
    };
    (cookies as jest.Mock).mockResolvedValue(store);

    await expect(getAccessToken()).resolves.toBe("access-value");
    await expect(getRefreshToken()).resolves.toBe("refresh-value");
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd apps/web && npx jest lib/server/session.test.ts`
Expected: FAIL — `Cannot find module './session'`

- [ ] **Step 4: Implement the session cookie helpers**

```ts
// apps/web/lib/server/session.ts
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
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/web && npx jest lib/server/session.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/server/cookie-names.ts apps/web/lib/server/session.ts apps/web/lib/server/session.test.ts
git commit -m "feat(web): add httpOnly session cookie helpers"
```

---

### Task 4: Server-side API client with 401 refresh-and-retry

**Files:**
- Create: `apps/web/lib/server/api-client.ts`
- Test: `apps/web/lib/server/api-client.test.ts`

**Interfaces:**
- Consumes: `getAccessToken`, `getRefreshToken`, `setSessionCookies`, `clearSessionCookies` (Task 3); `env.apiUrl` (existing `@/lib/env`); `AuthTokens`, `ApiErrorBody` types (Task 2).
- Produces: `ApiError` (class, `.status: number`), `SessionExpiredError` (class), `refreshSession(): Promise<boolean>`, `apiFetch<T>(path: string, init?: RequestInit): Promise<T>` (all from `@/lib/server/api-client` — this is the one shared, typed API client foundation every future feature reuses).

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/lib/server/api-client.test.ts
jest.mock("./session", () => ({
  getAccessToken: jest.fn(),
  getRefreshToken: jest.fn(),
  setSessionCookies: jest.fn(),
  clearSessionCookies: jest.fn(),
}));

import {
  getAccessToken,
  getRefreshToken,
  setSessionCookies,
  clearSessionCookies,
} from "./session";
import { apiFetch, refreshSession, ApiError, SessionExpiredError } from "./api-client";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("apiFetch", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    global.fetch = jest.fn();
  });

  it("throws SessionExpiredError when there is no access token", async () => {
    (getAccessToken as jest.Mock).mockResolvedValue(undefined);
    await expect(apiFetch("/auth/me")).rejects.toBeInstanceOf(SessionExpiredError);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("returns parsed JSON on success", async () => {
    (getAccessToken as jest.Mock).mockResolvedValue("valid-token");
    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse(200, { id: "u1" }));

    await expect(apiFetch("/auth/me")).resolves.toEqual({ id: "u1" });
  });

  it("refreshes once and retries on a 401, then succeeds", async () => {
    (getAccessToken as jest.Mock)
      .mockResolvedValueOnce("expired-token")
      .mockResolvedValueOnce("new-token");
    (getRefreshToken as jest.Mock).mockResolvedValue("refresh-token");
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse(401, { statusCode: 401, message: "expired" }))
      .mockResolvedValueOnce(
        jsonResponse(200, { accessToken: "new-token", refreshToken: "new-refresh" }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { id: "u1" }));

    await expect(apiFetch("/auth/me")).resolves.toEqual({ id: "u1" });
    expect(setSessionCookies).toHaveBeenCalledWith({
      accessToken: "new-token",
      refreshToken: "new-refresh",
    });
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it("throws SessionExpiredError when refresh itself fails", async () => {
    (getAccessToken as jest.Mock).mockResolvedValue("expired-token");
    (getRefreshToken as jest.Mock).mockResolvedValue("refresh-token");
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse(401, { statusCode: 401, message: "expired" }),
    );
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse(401, { statusCode: 401, message: "invalid refresh token" }),
    );

    await expect(apiFetch("/auth/me")).rejects.toBeInstanceOf(SessionExpiredError);
    expect(clearSessionCookies).toHaveBeenCalled();
  });

  it("throws ApiError with status and message for non-401 failures", async () => {
    (getAccessToken as jest.Mock).mockResolvedValue("valid-token");
    (global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse(403, { statusCode: 403, message: "Insufficient role for this action" }),
    );

    const error = await apiFetch("/cases/1").catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(403);
    expect(error.message).toBe("Insufficient role for this action");
  });
});

describe("refreshSession", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    global.fetch = jest.fn();
  });

  it("returns false with no refresh token, without calling fetch", async () => {
    (getRefreshToken as jest.Mock).mockResolvedValue(undefined);
    await expect(refreshSession()).resolves.toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("clears cookies and returns false when the backend rejects the refresh token", async () => {
    (getRefreshToken as jest.Mock).mockResolvedValue("bad-token");
    (global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse(401, { statusCode: 401, message: "Invalid refresh token" }),
    );

    await expect(refreshSession()).resolves.toBe(false);
    expect(clearSessionCookies).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && npx jest lib/server/api-client.test.ts`
Expected: FAIL — `Cannot find module './api-client'`

- [ ] **Step 3: Implement the API client**

```ts
// apps/web/lib/server/api-client.ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web && npx jest lib/server/api-client.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/server/api-client.ts apps/web/lib/server/api-client.test.ts
git commit -m "feat(web): add server-side API client with 401 refresh-and-retry"
```

---

### Task 5: Auth feature — service + Data Access Layer

**Files:**
- Create: `apps/web/features/auth/service.ts`
- Create: `apps/web/features/auth/dal.ts`
- Test: `apps/web/features/auth/service.test.ts`
- Test: `apps/web/features/auth/dal.test.ts`

**Interfaces:**
- Consumes: `apiFetch`, `SessionExpiredError`, `ApiError` (Task 4, `@/lib/server/api-client`); `getRefreshToken`, `setSessionCookies`, `clearSessionCookies` (Task 3, `@/lib/server/session`); `env.apiUrl` (existing `@/lib/env`); `PublicUser`, `AuthTokens` types (Task 2, `@/lib/api/types`).
- Produces: `InvalidCredentialsError` (class), `login(email: string, password: string): Promise<PublicUser>`, `logout(): Promise<void>`, `fetchCurrentUser(): Promise<PublicUser | null>` (all from `@/features/auth/service`); `getCurrentUser(): Promise<PublicUser | null>`, `verifySession(): Promise<PublicUser>` (from `@/features/auth/dal`, `verifySession` redirects to `/login` and never returns when there is no user).

- [ ] **Step 1: Write the failing tests for the auth service**

```ts
// apps/web/features/auth/service.test.ts
jest.mock("@/lib/server/api-client", () => {
  const actual = jest.requireActual("@/lib/server/api-client");
  return { ...actual, apiFetch: jest.fn() };
});
jest.mock("@/lib/server/session", () => ({
  getRefreshToken: jest.fn(),
  setSessionCookies: jest.fn(),
  clearSessionCookies: jest.fn(),
}));

import { apiFetch, SessionExpiredError, ApiError } from "@/lib/server/api-client";
import { getRefreshToken, setSessionCookies, clearSessionCookies } from "@/lib/server/session";
import { login, logout, fetchCurrentUser, InvalidCredentialsError } from "./service";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("login", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    global.fetch = jest.fn();
  });

  it("sets session cookies and returns the user on success", async () => {
    const user = { id: "u1", email: "a@b.com", name: "A", role: "analyst" };
    (global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse(200, { accessToken: "at", refreshToken: "rt", user }),
    );

    await expect(login("a@b.com", "pw")).resolves.toEqual(user);
    expect(setSessionCookies).toHaveBeenCalledWith({ accessToken: "at", refreshToken: "rt" });
  });

  it("throws InvalidCredentialsError on a 401", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse(401, { statusCode: 401, message: "Invalid credentials" }),
    );

    await expect(login("a@b.com", "wrong")).rejects.toBeInstanceOf(InvalidCredentialsError);
    expect(setSessionCookies).not.toHaveBeenCalled();
  });
});

describe("logout", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    global.fetch = jest.fn().mockResolvedValue(new Response(null, { status: 204 }));
  });

  it("calls the backend logout and always clears cookies", async () => {
    (getRefreshToken as jest.Mock).mockResolvedValue("rt");
    await logout();
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/v1/auth/logout"),
      expect.objectContaining({ method: "POST" }),
    );
    expect(clearSessionCookies).toHaveBeenCalled();
  });

  it("still clears cookies when there is no refresh token to revoke", async () => {
    (getRefreshToken as jest.Mock).mockResolvedValue(undefined);
    await logout();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(clearSessionCookies).toHaveBeenCalled();
  });

  it("still clears cookies when the backend call throws", async () => {
    (getRefreshToken as jest.Mock).mockResolvedValue("rt");
    (global.fetch as jest.Mock).mockRejectedValue(new Error("network down"));
    await logout();
    expect(clearSessionCookies).toHaveBeenCalled();
  });
});

describe("fetchCurrentUser", () => {
  it("returns the user on success", async () => {
    const user = { id: "u1", email: "a@b.com", name: "A", role: "analyst" };
    (apiFetch as jest.Mock).mockResolvedValue(user);
    await expect(fetchCurrentUser()).resolves.toEqual(user);
  });

  it("returns null when the session has expired", async () => {
    (apiFetch as jest.Mock).mockRejectedValue(new SessionExpiredError());
    await expect(fetchCurrentUser()).resolves.toBeNull();
  });

  it("rethrows other errors", async () => {
    (apiFetch as jest.Mock).mockRejectedValue(new ApiError(500, "boom"));
    await expect(fetchCurrentUser()).rejects.toBeInstanceOf(ApiError);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && npx jest features/auth/service.test.ts`
Expected: FAIL — `Cannot find module './service'`

- [ ] **Step 3: Implement the auth service**

```ts
// apps/web/features/auth/service.ts
import "server-only";
import { env } from "@/lib/env";
import { apiFetch, SessionExpiredError } from "@/lib/server/api-client";
import { clearSessionCookies, getRefreshToken, setSessionCookies } from "@/lib/server/session";
import type { AuthTokens, PublicUser } from "@/lib/api/types";

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
  await setSessionCookies(body);
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
```

- [ ] **Step 4: Run the auth service tests to verify they pass**

Run: `cd apps/web && npx jest features/auth/service.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Write the failing tests for the DAL**

```ts
// apps/web/features/auth/dal.test.ts
jest.mock("./service", () => ({ fetchCurrentUser: jest.fn() }));
jest.mock("next/navigation", () => ({
  redirect: jest.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

import { fetchCurrentUser } from "./service";
import { redirect } from "next/navigation";

describe("verifySession", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("returns the user when one is present", async () => {
    (fetchCurrentUser as jest.Mock).mockResolvedValue({ id: "u1", role: "analyst" });
    const { verifySession } = await import("./dal");
    await expect(verifySession()).resolves.toEqual({ id: "u1", role: "analyst" });
    expect(redirect).not.toHaveBeenCalled();
  });

  it("redirects to /login when there is no user", async () => {
    (fetchCurrentUser as jest.Mock).mockResolvedValue(null);
    const { verifySession } = await import("./dal");
    await expect(verifySession()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/login");
  });
});
```

Note: `jest.resetModules()` + dynamic `import("./dal")` per test avoids React's `cache()` memoizing `getCurrentUser`'s result across test cases (each test gets a fresh module instance and therefore a fresh cache).

- [ ] **Step 6: Run the test to verify it fails**

Run: `cd apps/web && npx jest features/auth/dal.test.ts`
Expected: FAIL — `Cannot find module './dal'`

- [ ] **Step 7: Implement the DAL**

```ts
// apps/web/features/auth/dal.ts
import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { fetchCurrentUser } from "./service";
import type { PublicUser } from "@/lib/api/types";

// Memoized per server-render pass (React's cache()) so multiple Server
// Components on the same page share one /auth/me call instead of each
// independently hitting the backend (and, once a page needs several,
// independently racing a token refresh -- see the plan's Known
// architectural decisions, item 10).
export const getCurrentUser = cache(async (): Promise<PublicUser | null> => {
  return fetchCurrentUser();
});

export async function verifySession(): Promise<PublicUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}
```

- [ ] **Step 8: Run the DAL test to verify it passes**

Run: `cd apps/web && npx jest features/auth/dal.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 9: Commit**

```bash
git add apps/web/features/auth
git commit -m "feat(web): add auth feature service and Data Access Layer"
```

---

### Task 6: Nav registry, protected-path predicate, and proxy.ts

**Files:**
- Create: `apps/web/lib/nav.ts`
- Create: `apps/web/lib/server/protected-paths.ts`
- Create: `apps/web/proxy.ts`
- Test: `apps/web/lib/nav.test.ts`
- Test: `apps/web/lib/server/protected-paths.test.ts`

**Interfaces:**
- Consumes: `UserRole` type (Task 2), `ACCESS_TOKEN_COOKIE` (Task 3, `@/lib/server/cookie-names`).
- Produces: `NavItem` (type), `NAV_ITEMS` (array), `getVisibleNavItems(role: UserRole): NavItem[]` (from `@/lib/nav` — shared shell data, not feature-specific: every feature will eventually register an entry here); `isPublicPath(pathname: string): boolean` (from `@/lib/server/protected-paths`); the `proxy` function + `config` export in `proxy.ts` (no other module imports these — this is the file Next.js itself invokes).

- [ ] **Step 1: Write the failing test for the nav registry**

```ts
// apps/web/lib/nav.test.ts
import { getVisibleNavItems, NAV_ITEMS } from "./nav";

describe("getVisibleNavItems", () => {
  it("only returns items whose roles include the given role", () => {
    const forAnalyst = getVisibleNavItems("analyst");
    const forLead = getVisibleNavItems("lead");
    expect(forAnalyst.every((item) => item.roles.includes("analyst"))).toBe(true);
    expect(forLead.every((item) => item.roles.includes("lead"))).toBe(true);
  });

  it("only lists routes that actually exist in this milestone", () => {
    expect(NAV_ITEMS.map((item) => item.href)).toEqual(["/"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && npx jest lib/nav.test.ts`
Expected: FAIL — `Cannot find module './nav'`

- [ ] **Step 3: Implement the nav registry**

```ts
// apps/web/lib/nav.ts
import type { UserRole } from "@/lib/api/types";

export interface NavItem {
  label: string;
  href: string;
  roles: UserRole[];
}

// Registry of workspace nav destinations, shared across every feature (not
// owned by any one of them). Only "Workspace" is a real route today --
// Alerts/Cases/Dashboard/Investigation/Evidence/Timeline are later Phase 2
// milestones (see docs/PROGRESS.md) and are deliberately not listed here
// yet, so this foundation never links to a page that doesn't exist. Later
// milestones add entries here; the filtering mechanism below does not
// change.
export const NAV_ITEMS: NavItem[] = [
  { label: "Workspace", href: "/", roles: ["analyst", "lead"] },
];

export function getVisibleNavItems(role: UserRole): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}
```

- [ ] **Step 4: Run the nav test to verify it passes**

Run: `cd apps/web && npx jest lib/nav.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Write the failing test for the protected-path predicate**

```ts
// apps/web/lib/server/protected-paths.test.ts
import { isPublicPath } from "./protected-paths";

describe("isPublicPath", () => {
  it("treats /login as public", () => {
    expect(isPublicPath("/login")).toBe(true);
  });

  it("treats every other path as protected", () => {
    expect(isPublicPath("/")).toBe(false);
    expect(isPublicPath("/cases")).toBe(false);
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `cd apps/web && npx jest lib/server/protected-paths.test.ts`
Expected: FAIL — `Cannot find module './protected-paths'`

- [ ] **Step 7: Implement the predicate**

```ts
// apps/web/lib/server/protected-paths.ts
const PUBLIC_PATHS = ["/login"];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.includes(pathname);
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `cd apps/web && npx jest lib/server/protected-paths.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 9: Create `proxy.ts`**

```ts
// apps/web/proxy.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ACCESS_TOKEN_COOKIE } from "@/lib/server/cookie-names";
import { isPublicPath } from "@/lib/server/protected-paths";

// Optimistic only: this checks for the *presence* of the access-token
// cookie, nothing more. The authoritative check is verifySession() in the
// auth feature's Data Access Layer, which asks NestJS's /auth/me -- the
// only source of truth for whether a session is actually valid. This
// proxy exists purely so a signed-out browser doesn't render a protected
// page's shell (and a signed-in browser doesn't see the login page),
// matching Next's own "optimistic checks only in Proxy" guidance.
export function proxy(request: NextRequest) {
  const hasSessionCookie = request.cookies.has(ACCESS_TOKEN_COOKIE);
  const { pathname } = request.nextUrl;

  if (!hasSessionCookie && !isPublicPath(pathname)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (hasSessionCookie && isPublicPath(pathname)) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 10: Commit**

```bash
git add apps/web/lib/nav.ts apps/web/lib/nav.test.ts apps/web/lib/server/protected-paths.ts apps/web/lib/server/protected-paths.test.ts apps/web/proxy.ts
git commit -m "feat(web): add nav registry, protected-path predicate, and proxy"
```

---

### Task 7: Minimal UI primitives (including the empty-state foundation)

**Files:**
- Create: `apps/web/components/ui/button.tsx`
- Create: `apps/web/components/ui/text-field.tsx`
- Create: `apps/web/components/ui/form-error.tsx`
- Create: `apps/web/components/ui/empty-state.tsx`
- Test: `apps/web/components/ui/button.test.tsx`
- Test: `apps/web/components/ui/text-field.test.tsx`
- Test: `apps/web/components/ui/empty-state.test.tsx`

**Interfaces:**
- Produces: `Button` (props: standard `<button>` props + `variant?: "primary" | "secondary"`), `TextField` (props: `label: string` + standard `<input>` props), `FormError` (props: `message: string`), `EmptyState` (props: `title: string`, `description?: string`) — all from `@/components/ui/*`. `Button`/`TextField`/`FormError` are consumed by Task 8's login form and Task 9's logout button/header this milestone; `EmptyState` has no consumer yet — it's the reusable primitive later list screens (Alerts queue, Cases queue) will use for "no alerts pending triage" / "no cases assigned to you", established now as part of this milestone's explicit "empty-state foundation" requirement.

- [ ] **Step 1: Write the failing component tests**

```tsx
// apps/web/components/ui/button.test.tsx
import { render, screen } from "@testing-library/react";
import { Button } from "./button";

describe("Button", () => {
  it("renders its children and forwards the type prop", () => {
    render(<Button type="submit">Sign in</Button>);
    const button = screen.getByRole("button", { name: "Sign in" });
    expect(button).toHaveAttribute("type", "submit");
  });

  it("disables the button when disabled is passed", () => {
    render(<Button disabled>Sign in</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
  });
});
```

```tsx
// apps/web/components/ui/text-field.test.tsx
import { render, screen } from "@testing-library/react";
import { TextField } from "./text-field";

describe("TextField", () => {
  it("associates the label with the input", () => {
    render(<TextField label="Email" name="email" type="email" />);
    const input = screen.getByLabelText("Email");
    expect(input).toHaveAttribute("name", "email");
    expect(input).toHaveAttribute("type", "email");
  });
});
```

```tsx
// apps/web/components/ui/empty-state.test.tsx
import { render, screen } from "@testing-library/react";
import { EmptyState } from "./empty-state";

describe("EmptyState", () => {
  it("renders the title and optional description", () => {
    render(<EmptyState title="No cases assigned to you" description="Check back later." />);
    expect(screen.getByText("No cases assigned to you")).toBeInTheDocument();
    expect(screen.getByText("Check back later.")).toBeInTheDocument();
  });

  it("renders without a description", () => {
    render(<EmptyState title="No alerts pending triage" />);
    expect(screen.getByText("No alerts pending triage")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && npx jest components/ui`
Expected: FAIL — `Cannot find module './button'` / `'./text-field'` / `'./empty-state'`

- [ ] **Step 3: Implement the primitives**

```tsx
// apps/web/components/ui/button.tsx
import type { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary";
}

const VARIANT_CLASSES: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary:
    "bg-black text-white hover:bg-black/80 dark:bg-white dark:text-black dark:hover:bg-white/80",
  secondary:
    "border border-black/20 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10",
};

export function Button({ variant = "primary", className = "", ...props }: ButtonProps) {
  return (
    <button
      className={`rounded-md px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    />
  );
}
```

```tsx
// apps/web/components/ui/text-field.tsx
import type { InputHTMLAttributes } from "react";

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export function TextField({ label, id, name, className = "", ...props }: TextFieldProps) {
  const inputId = id ?? name;
  return (
    <div className="space-y-1">
      <label htmlFor={inputId} className="block text-sm font-medium">
        {label}
      </label>
      <input
        id={inputId}
        name={name}
        className={`w-full rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent ${className}`}
        {...props}
      />
    </div>
  );
}
```

```tsx
// apps/web/components/ui/form-error.tsx
export function FormError({ message }: { message: string }) {
  return (
    <p role="alert" className="text-sm text-red-700 dark:text-red-400">
      {message}
    </p>
  );
}
```

```tsx
// apps/web/components/ui/empty-state.tsx
export function EmptyState({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="rounded-lg border border-dashed border-black/15 px-6 py-10 text-center dark:border-white/15">
      <p className="text-sm font-medium">{title}</p>
      {description && (
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">{description}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web && npx jest components/ui`
Expected: PASS (5 tests)

- [ ] **Step 5: Confirm the existing loading/error foundation already covers this milestone**

`apps/web/app/loading.tsx`, `apps/web/app/error.tsx`, and `apps/web/app/global-error.tsx` already exist at the root and apply to every route (including `/login` and the new `(workspace)` group) via Next.js's file-convention cascade — a route segment without its own `loading.tsx`/`error.tsx` falls back to the nearest ancestor's. No changes needed for this milestone; this step is a deliberate check, not a skip. Confirm by inspecting both files' current content matches what's already in the repo (a centered "Loading…" state and a "Something went wrong" + "Try again" boundary) and noting in Task 10's PROGRESS.md update that they were reviewed, not modified.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/ui
git commit -m "feat(web): add minimal Button, TextField, FormError, and EmptyState primitives"
```

---

### Task 8: Login page, Server Action, and form

**Files:**
- Create: `apps/web/app/login/actions.ts`
- Create: `apps/web/app/login/login-form.tsx`
- Create: `apps/web/app/login/page.tsx`
- Test: `apps/web/app/login/login-form.test.tsx`

**Interfaces:**
- Consumes: `login`, `InvalidCredentialsError` (Task 5, `@/features/auth/service`); `getCurrentUser` (Task 5, `@/features/auth/dal`); `Button`, `TextField`, `FormError` (Task 7).
- Produces: `loginAction(prevState: LoginFormState, formData: FormData): Promise<LoginFormState>` and `LoginFormState` (from `@/app/login/actions`, consumed only by `login-form.tsx` in this task); the `/login` route.

- [ ] **Step 1: Implement the Server Action**

(Not unit-tested directly — it's a thin `"use server"` wrapper over already-tested `login()`; its behavior is covered by `login-form.test.tsx`'s rendering tests below and the end-to-end manual verification in Task 10.)

```ts
// apps/web/app/login/actions.ts
"use server";

import { redirect } from "next/navigation";
import { login, InvalidCredentialsError } from "@/features/auth/service";

export interface LoginFormState {
  error?: string;
}

export async function loginAction(
  _prevState: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  try {
    await login(email, password);
  } catch (error) {
    if (error instanceof InvalidCredentialsError) {
      return { error: "Invalid email or password." };
    }
    return { error: "Something went wrong. Please try again." };
  }

  redirect("/");
}
```

- [ ] **Step 2: Write the failing test for the login form's rendering**

```tsx
// apps/web/app/login/login-form.test.tsx
import { render, screen } from "@testing-library/react";
import { LoginForm } from "./login-form";

// React's useActionState needs a real (or realistic-enough) action; this
// test only exercises rendering, not submission -- submission against a
// real backend is covered by the manual verification pass (Task 10),
// which is the only place an actual HTTP round trip and redirect can be
// observed end-to-end.
describe("LoginForm", () => {
  it("renders labeled email and password fields and a submit button", () => {
    render(<LoginForm />);
    expect(screen.getByLabelText("Email")).toHaveAttribute("type", "email");
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd apps/web && npx jest app/login/login-form.test.tsx`
Expected: FAIL — `Cannot find module './login-form'`

- [ ] **Step 4: Implement the login form**

```tsx
// apps/web/app/login/login-form.tsx
"use client";

import { useActionState } from "react";
import { loginAction, type LoginFormState } from "./actions";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { FormError } from "@/components/ui/form-error";

const initialState: LoginFormState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <TextField label="Email" name="email" type="email" autoComplete="email" required />
      <TextField
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
      />
      {state.error && <FormError message={state.error} />}
      <Button type="submit" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd apps/web && npx jest app/login/login-form.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 6: Implement the login page**

```tsx
// apps/web/app/login/page.tsx
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/features/auth/dal";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) {
    redirect("/");
  }

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-sm flex-col justify-center gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Sign in to Kestro</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          SOC Operations &amp; Investigation Platform
        </p>
      </div>
      <LoginForm />
    </div>
  );
}
```

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/login
git commit -m "feat(web): add login page, Server Action, and form"
```

---

### Task 9: Protected workspace layout, role-aware nav, logout, placeholder home

**Files:**
- Create: `apps/web/app/(workspace)/layout.tsx`
- Create: `apps/web/app/(workspace)/workspace-header.tsx`
- Create: `apps/web/app/(workspace)/logout-button.tsx`
- Create: `apps/web/app/(workspace)/actions.ts`
- Create: `apps/web/app/(workspace)/page.tsx`
- Test: `apps/web/app/(workspace)/workspace-header.test.tsx`
- Modify: `apps/web/app/layout.tsx`
- Delete: `apps/web/app/page.tsx` (superseded — see plan decision 8)
- Delete: `apps/web/components/layout/header.tsx`, `apps/web/components/layout/header.test.tsx` (superseded — see plan decision 8)

**Interfaces:**
- Consumes: `verifySession` (Task 5, `@/features/auth/dal`), `getVisibleNavItems`, `NavItem` type (Task 6, `@/lib/nav`), `logout` (Task 5, `@/features/auth/service`), `PublicUser` type (Task 2), `Button` (Task 7).
- Produces: the `/` route (protected), `logoutAction(): Promise<void>` (from `@/app/(workspace)/actions`, consumed only by `logout-button.tsx`).

- [ ] **Step 1: Write the failing test for the workspace header**

```tsx
// apps/web/app/(workspace)/workspace-header.test.tsx
import { render, screen } from "@testing-library/react";
import { WorkspaceHeader } from "./workspace-header";

jest.mock("./logout-button", () => ({
  LogoutButton: () => <button>Log out</button>,
}));

describe("WorkspaceHeader", () => {
  it("shows the signed-in user's name and role, and only their visible nav items", () => {
    render(
      <WorkspaceHeader
        user={{
          id: "u1",
          email: "a@b.com",
          name: "Ada",
          role: "analyst",
          disabledAt: null,
          createdAt: "",
          updatedAt: "",
        }}
        navItems={[{ label: "Workspace", href: "/", roles: ["analyst", "lead"] }]}
      />,
    );

    expect(screen.getByText(/Ada/)).toBeInTheDocument();
    expect(screen.getByText(/analyst/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Workspace" })).toHaveAttribute("href", "/");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && npx jest "app/(workspace)/workspace-header.test.tsx"`
Expected: FAIL — `Cannot find module './workspace-header'`

- [ ] **Step 3: Implement the logout action and button**

```ts
// apps/web/app/(workspace)/actions.ts
"use server";

import { redirect } from "next/navigation";
import { logout } from "@/features/auth/service";

export async function logoutAction(): Promise<void> {
  await logout();
  redirect("/login");
}
```

```tsx
// apps/web/app/(workspace)/logout-button.tsx
"use client";

import { logoutAction } from "./actions";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <Button type="submit" variant="secondary">
        Log out
      </Button>
    </form>
  );
}
```

- [ ] **Step 4: Implement the workspace header**

```tsx
// apps/web/app/(workspace)/workspace-header.tsx
import Link from "next/link";
import type { PublicUser } from "@/lib/api/types";
import type { NavItem } from "@/lib/nav";
import { LogoutButton } from "./logout-button";

export function WorkspaceHeader({
  user,
  navItems,
}: {
  user: PublicUser;
  navItems: NavItem[];
}) {
  return (
    <header className="border-b border-black/10 dark:border-white/10">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <span className="text-lg font-semibold">Kestro</span>
        <nav aria-label="Primary" className="flex items-center gap-4 text-sm">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3 text-sm text-black/60 dark:text-white/60">
          <span>
            {user.name} · {user.role}
          </span>
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd apps/web && npx jest "app/(workspace)/workspace-header.test.tsx"`
Expected: PASS (1 test)

- [ ] **Step 6: Implement the workspace layout and placeholder home page**

```tsx
// apps/web/app/(workspace)/layout.tsx
import type { ReactNode } from "react";
import { verifySession } from "@/features/auth/dal";
import { getVisibleNavItems } from "@/lib/nav";
import { WorkspaceHeader } from "./workspace-header";

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const user = await verifySession();
  const navItems = getVisibleNavItems(user.role);

  return (
    <div className="flex min-h-full flex-col">
      <WorkspaceHeader user={user} navItems={navItems} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
```

```tsx
// apps/web/app/(workspace)/page.tsx
import { verifySession } from "@/features/auth/dal";

export default async function WorkspaceHomePage() {
  const user = await verifySession();

  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold">Welcome, {user.name}</h1>
      <p className="text-sm text-black/60 dark:text-white/60">
        Signed in as {user.role}. Alerts, Cases, and the rest of the Operations
        Workspace land in later milestones (see docs/PROGRESS.md).
      </p>
    </div>
  );
}
```

- [ ] **Step 7: Retire the superseded placeholder scaffold**

```bash
rm apps/web/app/page.tsx
rm apps/web/components/layout/header.tsx
rm apps/web/components/layout/header.test.tsx
```

- [ ] **Step 8: Update the root layout to drop the old static header**

```tsx
// apps/web/app/layout.tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Kestro",
  description: "SOC Operations & Investigation Platform",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <main className="mx-auto flex-1 w-full max-w-5xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
```

Note: `/login`'s own page content already centers itself (`min-h-[60vh]`), and the workspace layout renders its own header + `<main>` nested as plain children of this root `<main>` — verify in Step 9 that there is exactly one `<main>` landmark per rendered page (the workspace layout's inner wrapper should not itself be a second `<main>` element; it already isn't, per Task 9 Step 6's markup, which uses a plain `<div>` shell with its own `<main>` — confirm during the build/manual check that this doesn't nest two `<main>` tags for `(workspace)` routes, and adjust the outer wrapper to a `<div>` if it does).

- [ ] **Step 9: Run the full frontend test suite**

Run: `cd apps/web && npx jest`
Expected: PASS, all suites (jwt, session, api-client, service, dal, nav, protected-paths, button, text-field, empty-state, login-form, workspace-header)

- [ ] **Step 10: Commit**

```bash
git add -A apps/web/app apps/web/components
git commit -m "feat(web): add protected workspace layout, role-aware nav, and logout; retire placeholder shell"
```

---

### Task 10: Full verification pass + docs/PROGRESS.md implementation summary

**Files:**
- Modify: `docs/PROGRESS.md`

- [ ] **Step 1: TypeScript check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 2: ESLint**

Run: `cd apps/web && npm run lint`
Expected: no errors

- [ ] **Step 3: Frontend production build**

Run: `cd apps/web && npm run build`
Expected: build succeeds; confirm no route conflict errors (from removing `app/page.tsx` in favor of `app/(workspace)/page.tsx`) and no client-bundle warnings about `server-only` modules being imported into client code

- [ ] **Step 4: Existing backend tests remain passing (no backend files were touched, but confirm nothing regressed)**

Run: `cd apps/api && npm test && npm run test:e2e`
Expected: same pass counts as documented in docs/PROGRESS.md (125 unit / 98 e2e as of `b616883`)

- [ ] **Step 5: Manual end-to-end auth flow against real dev servers**

Start the dedicated dev Postgres container, the NestJS API (`cd apps/api && npm run start:dev`), and the Next.js app (`cd apps/web && npm run dev`). Using a throwaway analyst user already in the dev DB (or create one via existing `POST /v1/users` as a Lead, per docs/PROGRESS.md's existing dev workflow), verify:

1. Visiting `http://localhost:3000/` with no cookies → redirected to `/login` (proxy's optimistic check).
2. Submitting valid credentials at `/login` → confirm via browser devtools Network tab that the response sets `Set-Cookie` for both `kestro_access_token` and `kestro_refresh_token`, each with `HttpOnly`, `SameSite=Lax`, and no `Secure` flag (since `NODE_ENV=development` here); redirected to `/`.
3. `document.cookie` in the browser console on `/` does **not** list either cookie (confirms `HttpOnly` is actually opaque to JS, not just configured).
4. Reloading `/` with the session cookies → renders the workspace shell with the signed-in user's name and role, no redirect.
5. Visiting `/login` with the session cookies → redirected to `/` (proxy's second branch).
6. Manually expire the access token (temporarily set `JWT_ACCESS_EXPIRES_IN=5s` in `apps/api/.env` and restart the API) then reload `/` after waiting past that TTL → the DAL's `apiFetch` hits a 401, refreshes transparently, and the page still renders (confirm via API logs that `/v1/auth/refresh` was called exactly once for the reload). Restore `JWT_ACCESS_EXPIRES_IN` afterward.
7. Clicking "Log out" → redirected to `/login`; confirm via browser devtools that both cookies are gone; confirm visiting `/` afterward redirects back to `/login`.
8. Submitting invalid credentials at `/login` → form re-renders with "Invalid email or password.", no cookies set, no redirect.

Record the actual observed results (not assumed) in the PROGRESS.md update below.

- [ ] **Step 6: No secrets committed check**

Run: `git status` and `git diff main -- apps/web/.env.example` (should show no change — no new env vars were needed) — confirm no `.env`, `.env.local`, or credential file appears in `git status`.

- [ ] **Step 7: Update docs/PROGRESS.md with the implementation summary**

Append to the "## Phase 2 — Operations Workspace" section added in Task 1:

```markdown
### Phase 2 — Milestone 1: Operations Workspace Foundation (implemented)

**Implementation summary**: Next.js app shell with real authentication.
The browser only ever talks to the Next.js server; the Next.js server is
the only thing that talks to the NestJS API (`/v1/auth/login|refresh|logout|me`,
called exactly as already built — no backend changes). Two httpOnly
cookies (`kestro_access_token`, `kestro_refresh_token`) carry the JWT pair;
`lib/server/` (shared BFF plumbing: `session.ts` → `api-client.ts`, plus
`jwt.ts`/`cookie-names.ts`/`protected-paths.ts`) is the only code that
reads or writes them, and `features/auth/` (`service.ts` → `dal.ts`) is the
first feature module built on top of it — establishing the feature-oriented
structure later milestones (`features/alerts/`, `features/cases/`, ...)
extend. `proxy.ts` does a cheap, optimistic redirect based on cookie
*presence*; `verifySession()` (via NestJS `/auth/me`) is the only
authoritative check — the frontend makes no authorization decisions of
its own. The existing `app/loading.tsx`/`error.tsx`/`global-error.tsx`
were reviewed and left as-is (they already cascade to every route via
Next's file-convention fallback); a new `EmptyState` primitive
(`components/ui/empty-state.tsx`) rounds out the loading/error/empty-state
foundation, ready for the first list screen that needs it.

**Architectural decisions**:
- Login/logout are Server Actions (`app/login/actions.ts`,
  `app/(workspace)/actions.ts`), not hand-rolled Route Handlers — matches
  Next.js's own recommended authentication pattern and needs no separate
  JSON API layer for a form submission.
- Both cookies use `path: "/"`. A narrower path for the refresh cookie
  (e.g. `/api/auth`) was considered and rejected: refresh happens
  transparently during the render of whatever page the browser is already
  requesting, not via a dedicated endpoint the browser calls directly, so
  a narrow path would mean the browser never attaches the refresh cookie
  when it's needed.
- Cookie `maxAge` is derived from each JWT's own `exp` claim (unsigned
  base64url decode, `lib/server/jwt.ts`) rather than a hardcoded duration
  guessed to match the backend's `JWT_ACCESS_EXPIRES_IN`/
  `JWT_REFRESH_EXPIRES_IN`, which the frontend has no access to.
- Token refresh is reactive (triggered by a 401 in `apiFetch`, one retry),
  not proactive/scheduled — matches the backend's single-use refresh-token
  contract, where a second failure means the session is genuinely over.
- `proxy.ts` (not `middleware.ts` — deprecated and renamed in this Next.js
  version) does optimistic-only checks; no experimental `unauthorized()`/
  `authInterrupts` flag was used.
- `app/page.tsx` (old health-check demo) and `components/layout/header.tsx`
  (old static header) were removed, not kept alongside the new workspace —
  both were self-documented placeholders whose job was superseded by real
  auth; `app/(workspace)/page.tsx` now owns `/`.
- Frontend code is split `lib/server/` (shared BFF plumbing, feature-
  agnostic) vs. `features/auth/` (the Auth feature's own logic) — the
  first instance of the feature-oriented structure agreed in the prior
  architecture review; `lib/nav.ts` is shared shell data every future
  feature will register into, not owned by any one feature.

**Files changed**: see commit history from this milestone
(`lib/api/types.ts`, `lib/server/{jwt,cookie-names,session,api-client,
protected-paths}.ts` + tests, `features/auth/{service,dal}.ts` + tests,
`lib/nav.ts` + test, `proxy.ts`, `components/ui/{button,text-field,
form-error,empty-state}.tsx` + tests, `app/login/{actions,login-form,
page}.tsx` + test, `app/(workspace)/{layout,workspace-header,
logout-button,actions,page}.tsx` + test, `app/layout.tsx` modified,
`app/page.tsx` and `components/layout/header.{tsx,test.tsx}` removed).

**Dependencies added**: `server-only` (guards server-only modules from
being bundled into client code — a direct defense for "tokens must never
reach browser JavaScript").

**Verification**: [fill in actual results from Task 10 Steps 1-6 —
tsc/eslint/build status, backend test counts, and the 8 manually-observed
auth-flow outcomes from Step 5, stated as what was actually observed, not
assumed].

**Known limitations**:
- `getCurrentUser`'s single-flight protection is per-render-pass only
  (React's `cache()`); a future page issuing several parallel `apiFetch`
  calls in one request could race concurrent refreshes against the
  backend's single-use refresh-token rotation. Not an issue yet (this
  milestone has one `/auth/me` call per page) — must be addressed before
  any multi-fetch page (e.g. a case workspace with parallel tabs) ships.
- No rate limiting or CSRF-specific handling was added beyond what
  Server Actions provide by default (Next.js's built-in Server Action
  origin check) — consistent with the backend's own still-open
  "no rate limiting on /auth/login" item already tracked above.
- No password-reset, "remember me", or session-list/"log out everywhere"
  UI — not requested for this milestone.
- `EmptyState` has no consumer yet — it exists as foundation for the first
  list screen (Alerts or Cases queue) built in the next milestone.

**Next milestone**: Alerts UI or Cases UI (case queue + case workspace
shell), per the priority order from the read-only architecture review —
Cases first, since Alerts' "create/link case from alert" action depends on
case creation existing.
```

- [ ] **Step 8: Final review**

Re-read the diff (`git diff main --stat` and a full read of every changed file) to confirm: no token appears in any file that ships to the browser, no `NEXT_PUBLIC_*` variable was added, no unrelated feature (Alerts/Cases/Dashboard/Investigation/Evidence/Timeline UI) was implemented, and every step's actual command output (not an assumption) backs the verification claims written in Step 7.

- [ ] **Step 9: Commit**

```bash
git add docs/PROGRESS.md
git commit -m "docs: record Phase 2 Milestone 1 (Operations Workspace Foundation) completion"
```

Do not push. Confirm with the user before this final commit if a no-auto-commit instruction still stands at execution time.
