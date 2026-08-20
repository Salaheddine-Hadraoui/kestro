# Cases Workspace (Phase 2 — Milestone 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Cases Workspace — case list, case detail, case creation, all 9 lifecycle transitions, Lead-only reassignment, and note/comment collaboration — entirely on the frontend, on top of Milestone 1's BFF/auth/routing foundation, with zero backend changes.

**Architecture:** A `features/cases/` module (service functions wrapping the existing, unmodified `Cases` REST API via `apiFetch`) plus a `features/users/` module (for resolving `assigneeId`/`authorId` to display names via the already-open `GET /users`), consumed by three new Server Component pages (`/cases`, `/cases/new`, `/cases/[id]`) with small Client Component islands for the interactive forms (`useActionState` + Server Actions, mirroring `app/login/`'s existing pattern exactly). Notes and comments are read back by calling the existing `GET /cases/:caseId/timeline` endpoint and filtering, client-side, to only `comment` events and `note` events whose `content.event === "note_added"` (excluding system-generated `note` events like `assignee_changed`) — this is product decision (b): a narrow, filtered consumption of an existing endpoint, not a Timeline UI feature.

**Tech Stack:** Next.js 16 (App Router, Server Components + Server Actions), TypeScript, Tailwind — same as Milestone 1. No new dependencies.

**Spec:** No separate committed spec file exists. This plan implements the Milestone 2 — Cases Workspace product/technical specification and the seven product decisions from the conversation that approved it (see session history). This plan's Global Constraints section below carries forward every binding decision from that exchange verbatim, following the same convention Milestone 1's plan used for its own conversation-sourced spec.

## Global Constraints

- **No backend changes of any kind.** Every capability this milestone needs already exists, verified against `main` at commit `3d2741a`: `POST/GET /v1/cases`, `GET /v1/cases/:id`, `POST /v1/cases/:id/transitions`, `PATCH /v1/cases/:id`, `POST /v1/cases/:id/notes`, `POST /v1/cases/:id/comments`, `GET /v1/cases/:caseId/timeline`, `GET /v1/users`.
- **Notes/comments read-back uses the existing Timeline endpoint, filtered to `comment` and `note_added`-discriminated `note` events only.** No new backend endpoint. No Timeline UI (no rendering of `status_change`/`alert_linked`/`evidence_added` events, no pagination controls — fetch once at `limit=100`, show a static "showing latest 100" notice only if `total > 100`).
- **Case creation is in scope**: `POST /v1/cases` with `title`, `severity`, optional `assigneeId` (Analyst may only self-assign or omit; Lead may assign any active user). **No `alertIds`** — alert linking is out of scope.
- **Leave the existing 403-on-inaccessible-case backend behavior unchanged.** Handle 403 and 404 as two distinct, clean inline states in the frontend — never a crash, never a generic error page.
- **No `not-found.tsx` file.** Case-not-found and case-forbidden are inline states inside `app/(workspace)/cases/[id]/page.tsx`, not a Next.js file-convention page.
- **The frontend's copy of the case lifecycle transition table is display-only.** It exists only to decide which action buttons to render for the current user's role and the case's current status. The backend (`apps/api/src/cases/types/case-transitions.ts`) remains the sole enforcement point; every mutation still goes through the real API and its real guards. Do not add any endpoint or change to expose "available actions" from the backend.
- **Strictly Cases Workspace scope.** Do not implement, scaffold, or add a placeholder for: Alerts UI, Dashboard/metrics, Evidence UI, Timeline UI (beyond the narrow filtered read-back above), Investigation/Hypotheses UI, Playbooks, Knowledge, Integrations, or AI/agent functionality of any kind (no AI abstractions, no provider interfaces, no speculative hooks) — Kestro's future AI-assisted investigation direction is a later, separate phase; this milestone's only obligation to it is to not build anything that would need reworking later, which a plain human-operated case detail page already satisfies by construction.
- **No case export.** Not required by any current product requirement.
- **Follow every existing frontend pattern exactly** rather than introducing a new one: `apiFetch<T>()` for all authenticated backend calls (`lib/server/api-client.ts`, unchanged), `verifySession()` at the top of every protected page, Server Actions named `xAction` returning `{error?: string}` consumed via `useActionState`, `redirect()` (not `revalidatePath`, which has no precedent in this codebase) to refresh a page after a successful mutation, existing UI primitives (`Button`, `TextField`, `FormError`, `EmptyState`) reused as-is with zero modification, `lib/nav.ts`'s existing `NAV_ITEMS`/`getVisibleNavItems` mechanism for the new nav entry.
- **Every new mutation Server Action passes its target id via a hidden form field, not `.bind()`.** This project has already been burned once by an unverified Next.js-16-specific behavioral assumption (Task 10 of Milestone 1); a hidden `<input type="hidden">` is a plain HTML mechanism with no framework-version risk, and every prior Server Action in this codebase already only reads plain `FormData`.
- **Commit messages must never contain the phrase "claude wrote this" or any variant** — this recurred repeatedly during Milestone 1 from an unrelated org-wide instruction bleeding into subagent commit messages; every dispatch in this plan must be told explicitly not to do this.
- **Verification bar, every task**: from `apps/web/`, `npx jest` (full suite), `npx tsc --noEmit`, `npm run build`, `npm run lint` must all be clean before a task is considered done. The final task additionally requires a manual walkthrough against a live `next dev` server and the real NestJS API — this project's own history (Milestone 1's Task 10) shows unit tests alone did not catch a real architectural defect once already.

---

## File Structure

New files this plan creates (no existing file is modified except `lib/api/types.ts` and `lib/nav.ts`, both additive):

```
apps/web/
  lib/
    api/types.ts                          (MODIFY — add Case/Alert/Timeline types)
    nav.ts                                 (MODIFY — add "Cases" nav entry)
    case-transitions.ts                    (NEW — display-only transition table)
    case-transitions.test.ts               (NEW)
    case-notes.ts                          (NEW — pure note/comment extraction from timeline events)
    case-notes.test.ts                     (NEW)
    format-user.ts                         (NEW — pure id→name resolution helpers)
    format-user.test.ts                    (NEW)
  features/
    users/
      service.ts                           (NEW — listUsers())
      service.test.ts                      (NEW)
    cases/
      service.ts                           (NEW — listCases/getCase/createCase/transitionCase/reassignCase/addNote/addComment/listCaseTimelineEntries)
      service.test.ts                      (NEW)
  app/(workspace)/
    cases/
      page.tsx                             (NEW — case list)
      page.test.tsx                        (NEW)
      new/
        page.tsx                           (NEW — create-case page)
        case-form.tsx                      (NEW — client form)
        case-form.test.tsx                 (NEW)
        actions.ts                         (NEW — createCaseAction)
      [id]/
        page.tsx                           (NEW — case detail)
        page.test.tsx                      (NEW)
        actions.ts                         (NEW — transitionCaseAction/reassignCaseAction/addNoteAction/addCommentAction)
        transition-button.tsx              (NEW — client, one lifecycle-action form)
        transition-button.test.tsx         (NEW)
        reassign-form.tsx                  (NEW — client, Lead-only)
        reassign-form.test.tsx             (NEW)
        case-entry-form.tsx                (NEW — client, note/comment add form)
        case-entry-form.test.tsx           (NEW)
```

Each `service.ts` is a thin, pure-I/O wrapper (no business logic); each `lib/*.ts` is pure and independently unit-testable; each page composes services + pure helpers + small client islands, matching `app/login/`'s existing shape.

---

## Task 1: Case/Alert/Timeline API types + note/comment extraction helper

**Files:**
- Modify: `apps/web/lib/api/types.ts`
- Create: `apps/web/lib/case-notes.ts`
- Test: `apps/web/lib/case-notes.test.ts`

**Interfaces:**
- Produces: `Severity`, `CaseStatus`, `CaseAction`, `Case`, `Alert`, `CaseWithAlerts`, `PaginatedCases`, `TimelineEventType`, `TimelineEventWithAuthor`, `PaginatedTimelineEvents` (all in `lib/api/types.ts`); `HumanEntry`, `extractHumanEntries(events: TimelineEventWithAuthor[]): HumanEntry[]` (in `lib/case-notes.ts`).
- Consumes: existing `UserRole` from `lib/api/types.ts`.

- [ ] **Step 1: Add the new types to `lib/api/types.ts`**

Append to the end of `apps/web/lib/api/types.ts` (leave the existing `UserRole`/`PublicUser`/`AuthTokens`/`ApiErrorBody` untouched):

```ts
export type Severity = "low" | "medium" | "high" | "critical";

export type CaseStatus =
  | "OPEN"
  | "TRIAGING"
  | "INVESTIGATING"
  | "ESCALATED"
  | "MITIGATING"
  | "VERIFYING"
  | "RESOLVED";

// Mirrors apps/api/src/cases/types/case-transitions.ts's CaseAction enum
// values exactly. Display-only on this side -- the backend is the sole
// enforcement point for every one of these actions.
export type CaseAction =
  | "begin_triage"
  | "start_investigation"
  | "escalate"
  | "accept_escalation"
  | "begin_mitigation"
  | "begin_verification"
  | "resolve"
  | "reopen";

export interface Case {
  id: string;
  title: string;
  status: CaseStatus;
  severity: Severity;
  assigneeId: string;
  resolutionSummary: string | null;
  createdAt: string;
  updatedAt: string;
}

export type AlertStatus = "new" | "linked" | "dismissed";

// Read-only display shape for a case's linked alerts. Alerts UI itself is
// out of scope for this milestone -- this is only what apps/api's
// CaseWithAlerts type already returns alongside a case.
export interface Alert {
  id: string;
  source: string;
  summary: string;
  severity: Severity;
  status: AlertStatus;
  dismissReason: string | null;
  createdAt: string;
}

export interface CaseWithAlerts extends Case {
  alerts: Alert[];
}

export interface PaginatedCases {
  data: Case[];
  total: number;
  limit: number;
  offset: number;
}

export type TimelineEventType =
  | "note"
  | "status_change"
  | "evidence_added"
  | "comment"
  | "alert_linked";

// Only GET /cases/:caseId/timeline joins the author -- the write endpoints
// (POST .../notes, POST .../comments) return an unjoined TimelineEvent, but
// this milestone only ever reads notes/comments back through the Timeline
// endpoint, so this is the only shape this app needs.
export interface TimelineEventWithAuthor {
  id: string;
  caseId: string;
  type: TimelineEventType;
  authorId: string;
  content: Record<string, unknown>;
  createdAt: string;
  author: { id: string; name: string; role: UserRole };
}

export interface PaginatedTimelineEvents {
  data: TimelineEventWithAuthor[];
  total: number;
  limit: number;
  offset: number;
}
```

- [ ] **Step 2: Write the failing test for `extractHumanEntries`**

Create `apps/web/lib/case-notes.test.ts`:

```ts
import { extractHumanEntries } from "./case-notes";
import type { TimelineEventWithAuthor } from "./api/types";

const author = { id: "u1", name: "Ada Lovelace", role: "analyst" as const };

function makeEvent(overrides: Partial<TimelineEventWithAuthor>): TimelineEventWithAuthor {
  return {
    id: "e1",
    caseId: "c1",
    type: "comment",
    authorId: "u1",
    content: {},
    createdAt: "2026-08-19T00:00:00.000Z",
    author,
    ...overrides,
  };
}

describe("extractHumanEntries", () => {
  it("includes a comment event with its text", () => {
    const events = [makeEvent({ type: "comment", content: { text: "Looks like phishing" } })];
    expect(extractHumanEntries(events)).toEqual([
      {
        id: "e1",
        kind: "comment",
        text: "Looks like phishing",
        authorName: "Ada Lovelace",
        authorRole: "analyst",
        createdAt: "2026-08-19T00:00:00.000Z",
      },
    ]);
  });

  it("includes a human-authored note (event: note_added) with its text", () => {
    const events = [
      makeEvent({
        type: "note",
        content: { event: "note_added", text: "Checked the firewall logs" },
      }),
    ];
    expect(extractHumanEntries(events)).toEqual([
      {
        id: "e1",
        kind: "note",
        text: "Checked the firewall logs",
        authorName: "Ada Lovelace",
        authorRole: "analyst",
        createdAt: "2026-08-19T00:00:00.000Z",
      },
    ]);
  });

  it("excludes a system-generated note event (e.g. assignee_changed)", () => {
    const events = [
      makeEvent({
        type: "note",
        content: { event: "assignee_changed", fromAssigneeId: "u1", toAssigneeId: "u2" },
      }),
    ];
    expect(extractHumanEntries(events)).toEqual([]);
  });

  it("excludes status_change, alert_linked, and evidence_added events", () => {
    const events = [
      makeEvent({ id: "e2", type: "status_change", content: { action: "begin_triage" } }),
      makeEvent({ id: "e3", type: "alert_linked", content: { alertId: "a1" } }),
      makeEvent({ id: "e4", type: "evidence_added", content: {} }),
    ];
    expect(extractHumanEntries(events)).toEqual([]);
  });

  it("treats a non-string content.text as empty rather than throwing", () => {
    const events = [makeEvent({ type: "comment", content: { text: 42 } })];
    expect(extractHumanEntries(events)).toEqual([
      {
        id: "e1",
        kind: "comment",
        text: "",
        authorName: "Ada Lovelace",
        authorRole: "analyst",
        createdAt: "2026-08-19T00:00:00.000Z",
      },
    ]);
  });

  it("preserves chronological input order", () => {
    const events = [
      makeEvent({ id: "e1", type: "comment", content: { text: "first" } }),
      makeEvent({ id: "e2", type: "comment", content: { text: "second" } }),
    ];
    expect(extractHumanEntries(events).map((e) => e.text)).toEqual(["first", "second"]);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run (from `apps/web/`): `npx jest case-notes.test.ts`
Expected: FAIL with "Cannot find module './case-notes'"

- [ ] **Step 4: Implement `case-notes.ts`**

Create `apps/web/lib/case-notes.ts`:

```ts
import type { TimelineEventWithAuthor, UserRole } from "./api/types";

export interface HumanEntry {
  id: string;
  kind: "note" | "comment";
  text: string;
  authorName: string;
  authorRole: UserRole;
  createdAt: string;
}

function textOf(content: Record<string, unknown>): string {
  return typeof content.text === "string" ? content.text : "";
}

// The `note` timeline-event type is overloaded: Cases/Investigations also
// write system-generated `note` events (assignee_changed, hypothesis_*)
// that carry no human-authored text. Only a note whose content discriminator
// is "note_added" was actually written by a human via POST .../notes -- see
// apps/api/src/cases/cases.service.ts's addNote(). `comment` has exactly one
// meaning, so it needs no discriminator check.
export function extractHumanEntries(events: TimelineEventWithAuthor[]): HumanEntry[] {
  const entries: HumanEntry[] = [];
  for (const event of events) {
    if (event.type === "comment") {
      entries.push({
        id: event.id,
        kind: "comment",
        text: textOf(event.content),
        authorName: event.author.name,
        authorRole: event.author.role,
        createdAt: event.createdAt,
      });
    } else if (event.type === "note" && event.content.event === "note_added") {
      entries.push({
        id: event.id,
        kind: "note",
        text: textOf(event.content),
        authorName: event.author.name,
        authorRole: event.author.role,
        createdAt: event.createdAt,
      });
    }
  }
  return entries;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx jest case-notes.test.ts`
Expected: PASS, 6/6 tests.

- [ ] **Step 6: Run the full verification bar**

From `apps/web/`: `npx jest && npx tsc --noEmit && npm run build && npm run lint`
Expected: all clean.

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/api/types.ts apps/web/lib/case-notes.ts apps/web/lib/case-notes.test.ts
git commit -m "feat(web): add Case/Timeline API types and note/comment extraction"
```

---

## Task 2: Display-only case lifecycle transition table

**Files:**
- Create: `apps/web/lib/case-transitions.ts`
- Test: `apps/web/lib/case-transitions.test.ts`

**Interfaces:**
- Consumes: `CaseStatus`, `CaseAction`, `UserRole` from `lib/api/types.ts` (Task 1).
- Produces: `CaseTransitionRule` interface, `CASE_TRANSITIONS` array, `getAvailableActions(status: CaseStatus, role: UserRole): CaseTransitionRule[]`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/case-transitions.test.ts`:

```ts
import { getAvailableActions } from "./case-transitions";

describe("getAvailableActions", () => {
  it("returns begin_triage for an OPEN case, for either role", () => {
    expect(getAvailableActions("OPEN", "analyst").map((r) => r.action)).toEqual(["begin_triage"]);
    expect(getAvailableActions("OPEN", "lead").map((r) => r.action)).toEqual(["begin_triage"]);
  });

  it("returns start_investigation and escalate for a TRIAGING case", () => {
    const actions = getAvailableActions("TRIAGING", "analyst").map((r) => r.action);
    expect(actions.sort()).toEqual(["escalate", "start_investigation"]);
  });

  it("only offers accept_escalation to a Lead, never an Analyst", () => {
    expect(getAvailableActions("ESCALATED", "lead").map((r) => r.action)).toEqual([
      "accept_escalation",
    ]);
    expect(getAvailableActions("ESCALATED", "analyst")).toEqual([]);
  });

  it("only offers reopen to a Lead, never an Analyst", () => {
    expect(getAvailableActions("RESOLVED", "lead").map((r) => r.action)).toEqual(["reopen"]);
    expect(getAvailableActions("RESOLVED", "analyst")).toEqual([]);
  });

  it("returns no actions for a status/role combination with none", () => {
    expect(getAvailableActions("VERIFYING", "analyst").map((r) => r.action)).toEqual(["resolve"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest case-transitions.test.ts`
Expected: FAIL with "Cannot find module './case-transitions'"

- [ ] **Step 3: Implement `case-transitions.ts`**

Create `apps/web/lib/case-transitions.ts`:

```ts
import type { CaseAction, CaseStatus, UserRole } from "./api/types";

export interface CaseTransitionRule {
  action: CaseAction;
  from: CaseStatus;
  to: CaseStatus;
  roles: UserRole[];
  // Only "resolve" requires this -- rendered as a required field only for
  // that action's form (apps/api's TransitionCaseDto/CasesService enforce
  // the same requirement server-side; this is display-only).
  requiresResolutionSummary: boolean;
}

// Verbatim mirror of apps/api/src/cases/types/case-transitions.ts's
// CASE_TRANSITIONS table (one row per (action, from-status) pair --
// "escalate" appears twice, matching docs/WORKFLOW.md rows 3 and 4).
// Display-only: decides which action buttons render, never whether a
// mutation succeeds -- the backend re-validates every request against its
// own copy of this table regardless of what this file says.
export const CASE_TRANSITIONS: CaseTransitionRule[] = [
  {
    action: "begin_triage",
    from: "OPEN",
    to: "TRIAGING",
    roles: ["analyst", "lead"],
    requiresResolutionSummary: false,
  },
  {
    action: "start_investigation",
    from: "TRIAGING",
    to: "INVESTIGATING",
    roles: ["analyst", "lead"],
    requiresResolutionSummary: false,
  },
  {
    action: "escalate",
    from: "TRIAGING",
    to: "ESCALATED",
    roles: ["analyst", "lead"],
    requiresResolutionSummary: false,
  },
  {
    action: "escalate",
    from: "INVESTIGATING",
    to: "ESCALATED",
    roles: ["analyst", "lead"],
    requiresResolutionSummary: false,
  },
  {
    action: "accept_escalation",
    from: "ESCALATED",
    to: "INVESTIGATING",
    roles: ["lead"],
    requiresResolutionSummary: false,
  },
  {
    action: "begin_mitigation",
    from: "INVESTIGATING",
    to: "MITIGATING",
    roles: ["analyst", "lead"],
    requiresResolutionSummary: false,
  },
  {
    action: "begin_verification",
    from: "MITIGATING",
    to: "VERIFYING",
    roles: ["analyst", "lead"],
    requiresResolutionSummary: false,
  },
  {
    action: "resolve",
    from: "VERIFYING",
    to: "RESOLVED",
    roles: ["analyst", "lead"],
    requiresResolutionSummary: true,
  },
  {
    action: "reopen",
    from: "RESOLVED",
    to: "INVESTIGATING",
    roles: ["lead"],
    requiresResolutionSummary: false,
  },
];

export function getAvailableActions(
  status: CaseStatus,
  role: UserRole,
): CaseTransitionRule[] {
  return CASE_TRANSITIONS.filter((rule) => rule.from === status && rule.roles.includes(role));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest case-transitions.test.ts`
Expected: PASS, 5/5 tests.

- [ ] **Step 5: Run the full verification bar**

`npx jest && npx tsc --noEmit && npm run build && npm run lint`

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/case-transitions.ts apps/web/lib/case-transitions.test.ts
git commit -m "feat(web): add display-only case lifecycle transition table"
```

---

## Task 3: Users lookup + name resolution

**Files:**
- Create: `apps/web/features/users/service.ts`
- Create: `apps/web/lib/format-user.ts`
- Test: `apps/web/features/users/service.test.ts`
- Test: `apps/web/lib/format-user.test.ts`

**Interfaces:**
- Consumes: `apiFetch` (`lib/server/api-client.ts`, unchanged), `PublicUser` (`lib/api/types.ts`, unchanged).
- Produces: `listUsers(): Promise<PublicUser[]>` (`features/users/service.ts`); `buildUserNameMap(users: PublicUser[]): Map<string, PublicUser>` and `resolveUserName(users: Map<string, PublicUser>, userId: string): string` (`lib/format-user.ts`).

- [ ] **Step 1: Write the failing test for `listUsers`**

Create `apps/web/features/users/service.test.ts`:

```ts
/** @jest-environment node */
jest.mock("../../lib/server/api-client", () => {
  const actual = jest.requireActual("../../lib/server/api-client");
  return { ...actual, apiFetch: jest.fn() };
});

import { apiFetch } from "../../lib/server/api-client";
import { listUsers } from "./service";

describe("listUsers", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("fetches every user from GET /users", async () => {
    const users = [
      { id: "u1", email: "a@b.com", name: "Ada", role: "analyst", disabledAt: null, createdAt: "", updatedAt: "" },
    ];
    (apiFetch as jest.Mock).mockResolvedValue(users);

    await expect(listUsers()).resolves.toEqual(users);
    expect(apiFetch).toHaveBeenCalledWith("/users");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest features/users/service.test.ts`
Expected: FAIL with "Cannot find module './service'"

- [ ] **Step 3: Implement `features/users/service.ts`**

Create `apps/web/features/users/service.ts`:

```ts
import "server-only";
import { apiFetch } from "../../lib/server/api-client";
import type { PublicUser } from "../../lib/api/types";

// GET /users carries no role guard (apps/api/src/users/users.controller.ts)
// -- any authenticated user, Analyst or Lead, may list every user. Used
// here only to resolve a case's assigneeId/a timeline event's authorId to
// a display name; never used to gate anything client-side.
export async function listUsers(): Promise<PublicUser[]> {
  return apiFetch<PublicUser[]>("/users");
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest features/users/service.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing test for the name-resolution helpers**

Create `apps/web/lib/format-user.test.ts`:

```ts
import { buildUserNameMap, resolveUserName } from "./format-user";
import type { PublicUser } from "./api/types";

function makeUser(overrides: Partial<PublicUser>): PublicUser {
  return {
    id: "u1",
    email: "a@b.com",
    name: "Ada Lovelace",
    role: "analyst",
    disabledAt: null,
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

describe("buildUserNameMap / resolveUserName", () => {
  it("resolves a known user id to their name", () => {
    const map = buildUserNameMap([makeUser({ id: "u1", name: "Ada Lovelace" })]);
    expect(resolveUserName(map, "u1")).toBe("Ada Lovelace");
  });

  it("marks a disabled user's name", () => {
    const map = buildUserNameMap([
      makeUser({ id: "u1", name: "Ada Lovelace", disabledAt: "2026-01-01T00:00:00.000Z" }),
    ]);
    expect(resolveUserName(map, "u1")).toBe("Ada Lovelace (disabled)");
  });

  it("falls back to the raw id when the user isn't found", () => {
    const map = buildUserNameMap([]);
    expect(resolveUserName(map, "unknown-id")).toBe("unknown-id");
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npx jest lib/format-user.test.ts`
Expected: FAIL with "Cannot find module './format-user'"

- [ ] **Step 7: Implement `format-user.ts`**

Create `apps/web/lib/format-user.ts`:

```ts
import type { PublicUser } from "./api/types";

export function buildUserNameMap(users: PublicUser[]): Map<string, PublicUser> {
  return new Map(users.map((user) => [user.id, user]));
}

// Falls back to the raw id (never throws, never renders blank) so a
// dangling/unresolvable reference is still visibly an id rather than
// silently disappearing from the UI.
export function resolveUserName(users: Map<string, PublicUser>, userId: string): string {
  const user = users.get(userId);
  if (!user) {
    return userId;
  }
  return user.disabledAt ? `${user.name} (disabled)` : user.name;
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx jest lib/format-user.test.ts`
Expected: PASS.

- [ ] **Step 9: Run the full verification bar**

`npx jest && npx tsc --noEmit && npm run build && npm run lint`

- [ ] **Step 10: Commit**

```bash
git add apps/web/features/users/service.ts apps/web/features/users/service.test.ts apps/web/lib/format-user.ts apps/web/lib/format-user.test.ts
git commit -m "feat(web): add Users lookup and id-to-name resolution helpers"
```

---

## Task 4: Cases service layer

**Files:**
- Create: `apps/web/features/cases/service.ts`
- Test: `apps/web/features/cases/service.test.ts`

**Interfaces:**
- Consumes: `apiFetch` (unchanged); `Case`, `CaseWithAlerts`, `PaginatedCases`, `PaginatedTimelineEvents`, `CaseAction`, `Severity` (Task 1).
- Produces: `listCases(filters)`, `getCase(id)`, `createCase(input)`, `transitionCase(id, action, resolutionSummary?)`, `reassignCase(id, assigneeId)`, `addNote(id, content)`, `addComment(id, content)`, `listCaseTimelineEntries(id)` — every later task (5-9) calls exactly these names.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/features/cases/service.test.ts`:

```ts
/** @jest-environment node */
jest.mock("../../lib/server/api-client", () => {
  const actual = jest.requireActual("../../lib/server/api-client");
  return { ...actual, apiFetch: jest.fn() };
});

import { apiFetch } from "../../lib/server/api-client";
import {
  addComment,
  addNote,
  createCase,
  getCase,
  listCases,
  listCaseTimelineEntries,
  reassignCase,
  transitionCase,
} from "./service";

describe("cases service", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("listCases builds a query string from only the provided filters", async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ data: [], total: 0, limit: 25, offset: 0 });

    await listCases({ status: "OPEN", limit: 10, offset: 20 });

    expect(apiFetch).toHaveBeenCalledWith("/cases?status=OPEN&limit=10&offset=20");
  });

  it("listCases omits filters that are undefined", async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ data: [], total: 0, limit: 25, offset: 0 });

    await listCases({});

    expect(apiFetch).toHaveBeenCalledWith("/cases?");
  });

  it("getCase calls GET /cases/:id", async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ id: "c1" });
    await getCase("c1");
    expect(apiFetch).toHaveBeenCalledWith("/cases/c1");
  });

  it("createCase posts title/severity/assigneeId", async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ id: "c1" });
    await createCase({ title: "Suspicious login", severity: "high", assigneeId: "u1" });
    expect(apiFetch).toHaveBeenCalledWith("/cases", {
      method: "POST",
      body: JSON.stringify({ title: "Suspicious login", severity: "high", assigneeId: "u1" }),
    });
  });

  it("createCase omits assigneeId when not provided", async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ id: "c1" });
    await createCase({ title: "Suspicious login", severity: "high" });
    expect(apiFetch).toHaveBeenCalledWith("/cases", {
      method: "POST",
      body: JSON.stringify({ title: "Suspicious login", severity: "high" }),
    });
  });

  it("transitionCase posts the action, and resolutionSummary when given", async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ id: "c1" });
    await transitionCase("c1", "resolve", "Root cause identified and fixed.");
    expect(apiFetch).toHaveBeenCalledWith("/cases/c1/transitions", {
      method: "POST",
      body: JSON.stringify({ action: "resolve", resolutionSummary: "Root cause identified and fixed." }),
    });
  });

  it("transitionCase omits resolutionSummary when not given", async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ id: "c1" });
    await transitionCase("c1", "begin_triage");
    expect(apiFetch).toHaveBeenCalledWith("/cases/c1/transitions", {
      method: "POST",
      body: JSON.stringify({ action: "begin_triage" }),
    });
  });

  it("reassignCase patches the case with the new assigneeId", async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ id: "c1" });
    await reassignCase("c1", "u2");
    expect(apiFetch).toHaveBeenCalledWith("/cases/c1", {
      method: "PATCH",
      body: JSON.stringify({ assigneeId: "u2" }),
    });
  });

  it("addNote posts content to /cases/:id/notes", async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ id: "e1" });
    await addNote("c1", "Checked the logs");
    expect(apiFetch).toHaveBeenCalledWith("/cases/c1/notes", {
      method: "POST",
      body: JSON.stringify({ content: "Checked the logs" }),
    });
  });

  it("addComment posts content to /cases/:id/comments", async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ id: "e1" });
    await addComment("c1", "Agreed, escalating");
    expect(apiFetch).toHaveBeenCalledWith("/cases/c1/comments", {
      method: "POST",
      body: JSON.stringify({ content: "Agreed, escalating" }),
    });
  });

  it("listCaseTimelineEntries fetches up to 100 entries from the timeline endpoint", async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ data: [], total: 0, limit: 100, offset: 0 });
    await listCaseTimelineEntries("c1");
    expect(apiFetch).toHaveBeenCalledWith("/cases/c1/timeline?limit=100&offset=0");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest features/cases/service.test.ts`
Expected: FAIL with "Cannot find module './service'"

- [ ] **Step 3: Implement `features/cases/service.ts`**

Create `apps/web/features/cases/service.ts`:

```ts
import "server-only";
import { apiFetch } from "../../lib/server/api-client";
import type {
  CaseAction,
  CaseStatus,
  CaseWithAlerts,
  PaginatedCases,
  PaginatedTimelineEvents,
  Severity,
} from "../../lib/api/types";

export interface ListCasesFilters {
  status?: CaseStatus;
  severity?: Severity;
  assigneeId?: string;
  limit?: number;
  offset?: number;
}

export async function listCases(filters: ListCasesFilters): Promise<PaginatedCases> {
  const params = new URLSearchParams();
  if (filters.status !== undefined) params.set("status", filters.status);
  if (filters.severity !== undefined) params.set("severity", filters.severity);
  if (filters.assigneeId !== undefined) params.set("assigneeId", filters.assigneeId);
  if (filters.limit !== undefined) params.set("limit", String(filters.limit));
  if (filters.offset !== undefined) params.set("offset", String(filters.offset));
  return apiFetch<PaginatedCases>(`/cases?${params.toString()}`);
}

export async function getCase(id: string): Promise<CaseWithAlerts> {
  return apiFetch<CaseWithAlerts>(`/cases/${id}`);
}

export interface CreateCaseInput {
  title: string;
  severity: Severity;
  assigneeId?: string;
}

export async function createCase(input: CreateCaseInput): Promise<CaseWithAlerts> {
  return apiFetch<CaseWithAlerts>("/cases", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function transitionCase(
  id: string,
  action: CaseAction,
  resolutionSummary?: string,
): Promise<CaseWithAlerts> {
  const body: { action: CaseAction; resolutionSummary?: string } = { action };
  if (resolutionSummary !== undefined) {
    body.resolutionSummary = resolutionSummary;
  }
  return apiFetch<CaseWithAlerts>(`/cases/${id}/transitions`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function reassignCase(id: string, assigneeId: string): Promise<CaseWithAlerts> {
  return apiFetch<CaseWithAlerts>(`/cases/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ assigneeId }),
  });
}

export async function addNote(id: string, content: string): Promise<void> {
  await apiFetch(`/cases/${id}/notes`, {
    method: "POST",
    body: JSON.stringify({ content }),
  });
}

export async function addComment(id: string, content: string): Promise<void> {
  await apiFetch(`/cases/${id}/comments`, {
    method: "POST",
    body: JSON.stringify({ content }),
  });
}

// Fetches the case's timeline at the backend's max page size (100) rather
// than exposing any pagination UI -- product decision (b): a narrow,
// filtered read of the Timeline endpoint for Notes & Comments, not a
// Timeline UI feature. Callers filter the result with
// lib/case-notes.ts's extractHumanEntries().
export async function listCaseTimelineEntries(id: string): Promise<PaginatedTimelineEvents> {
  return apiFetch<PaginatedTimelineEvents>(`/cases/${id}/timeline?limit=100&offset=0`);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest features/cases/service.test.ts`
Expected: PASS, 11/11 tests.

- [ ] **Step 5: Run the full verification bar**

`npx jest && npx tsc --noEmit && npm run build && npm run lint`

- [ ] **Step 6: Commit**

```bash
git add apps/web/features/cases/service.ts apps/web/features/cases/service.test.ts
git commit -m "feat(web): add Cases service layer wrapping the existing Cases API"
```

---

## Task 5: Case list page

**Files:**
- Create: `apps/web/app/(workspace)/cases/page.tsx`
- Test: `apps/web/app/(workspace)/cases/page.test.tsx`
- Modify: `apps/web/lib/nav.ts`
- Test: `apps/web/lib/nav.test.ts` (extend existing)

**Interfaces:**
- Consumes: `verifySession()` (`features/auth/dal.ts`, unchanged); `listCases` (Task 4); `listUsers` (Task 3); `buildUserNameMap`/`resolveUserName` (Task 3); `EmptyState`, `Button` (existing, unchanged); `Case`, `CaseStatus`, `Severity` (Task 1).
- Produces: the `/cases` route.

- [ ] **Step 1: Read the existing `lib/nav.test.ts` to match its style**

Run: `sed -n '1,50p' apps/web/lib/nav.test.ts` and read it before writing the new assertion, so the added test matches the file's existing structure exactly (do not guess the format).

- [ ] **Step 2: Write the failing test for the nav entry**

Add this test case to the existing `describe` block in `apps/web/lib/nav.test.ts` (append, do not remove any existing test):

```ts
it("includes Cases for both analyst and lead", () => {
  expect(getVisibleNavItems("analyst").map((item) => item.href)).toContain("/cases");
  expect(getVisibleNavItems("lead").map((item) => item.href)).toContain("/cases");
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx jest lib/nav.test.ts`
Expected: FAIL — `/cases` not present in either list.

- [ ] **Step 4: Add the nav entry**

In `apps/web/lib/nav.ts`, replace:

```ts
export const NAV_ITEMS: NavItem[] = [
  { label: "Workspace", href: "/", roles: ["analyst", "lead"] },
];
```

with:

```ts
export const NAV_ITEMS: NavItem[] = [
  { label: "Workspace", href: "/", roles: ["analyst", "lead"] },
  { label: "Cases", href: "/cases", roles: ["analyst", "lead"] },
];
```

Also update the comment above `NAV_ITEMS` (currently says only "Workspace" is a real route) to remove `Cases` from the list of not-yet-real destinations, since it now is one.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx jest lib/nav.test.ts`
Expected: PASS.

- [ ] **Step 6: Write the failing test for the case list page**

Create `apps/web/app/(workspace)/cases/page.test.tsx`:

```tsx
/** @jest-environment node */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";

jest.mock("@/features/auth/dal", () => ({
  verifySession: jest.fn(),
}));
jest.mock("@/features/cases/service", () => ({
  listCases: jest.fn(),
}));
jest.mock("@/features/users/service", () => ({
  listUsers: jest.fn(),
}));

import { verifySession } from "@/features/auth/dal";
import { listCases } from "@/features/cases/service";
import { listUsers } from "@/features/users/service";
import CasesPage from "./page";

function makeCase(overrides: Record<string, unknown> = {}) {
  return {
    id: "c1",
    title: "Suspicious login",
    status: "OPEN",
    severity: "high",
    assigneeId: "u1",
    resolutionSummary: null,
    createdAt: "2026-08-19T00:00:00.000Z",
    updatedAt: "2026-08-19T00:00:00.000Z",
    ...overrides,
  };
}

describe("CasesPage", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (verifySession as jest.Mock).mockResolvedValue({
      id: "u1",
      name: "Ada Lovelace",
      role: "analyst",
    });
    (listUsers as jest.Mock).mockResolvedValue([
      { id: "u1", name: "Ada Lovelace", role: "analyst", disabledAt: null },
    ]);
  });

  it("renders a case row with its title, status, severity, and assignee name", async () => {
    (listCases as jest.Mock).mockResolvedValue({
      data: [makeCase()],
      total: 1,
      limit: 25,
      offset: 0,
    });

    const jsx = await CasesPage({ searchParams: Promise.resolve({}) });
    render(jsx);

    expect(screen.getByText("Suspicious login")).toBeInTheDocument();
    expect(screen.getByText("OPEN")).toBeInTheDocument();
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
  });

  it("renders an empty state when there are no cases", async () => {
    (listCases as jest.Mock).mockResolvedValue({ data: [], total: 0, limit: 25, offset: 0 });

    const jsx = await CasesPage({ searchParams: Promise.resolve({}) });
    render(jsx);

    expect(screen.getByText(/no cases/i)).toBeInTheDocument();
  });

  it("does not render an assignee filter control for an Analyst", async () => {
    (listCases as jest.Mock).mockResolvedValue({ data: [], total: 0, limit: 25, offset: 0 });

    const jsx = await CasesPage({ searchParams: Promise.resolve({}) });
    render(jsx);

    expect(screen.queryByLabelText(/assignee/i)).not.toBeInTheDocument();
  });

  it("renders an assignee filter control for a Lead", async () => {
    (verifySession as jest.Mock).mockResolvedValue({ id: "u2", name: "Grace Hopper", role: "lead" });
    (listCases as jest.Mock).mockResolvedValue({ data: [], total: 0, limit: 25, offset: 0 });

    const jsx = await CasesPage({ searchParams: Promise.resolve({}) });
    render(jsx);

    expect(screen.getByLabelText(/assignee/i)).toBeInTheDocument();
  });

  it("passes status/severity/assigneeId query params through to listCases", async () => {
    (verifySession as jest.Mock).mockResolvedValue({ id: "u2", name: "Grace Hopper", role: "lead" });
    (listCases as jest.Mock).mockResolvedValue({ data: [], total: 0, limit: 25, offset: 0 });

    await CasesPage({
      searchParams: Promise.resolve({ status: "OPEN", severity: "high", assigneeId: "u1" }),
    });

    expect(listCases).toHaveBeenCalledWith({
      status: "OPEN",
      severity: "high",
      assigneeId: "u1",
      limit: 25,
      offset: 0,
    });
  });
});
```

- [ ] **Step 7: Run the test to verify it fails**

Run: `npx jest app/\(workspace\)/cases/page.test.tsx`
Expected: FAIL with "Cannot find module './page'"

- [ ] **Step 8: Implement the case list page**

Create `apps/web/app/(workspace)/cases/page.tsx`:

```tsx
import { verifySession } from "@/features/auth/dal";
import { listCases } from "@/features/cases/service";
import { listUsers } from "@/features/users/service";
import { buildUserNameMap, resolveUserName } from "@/lib/format-user";
import { EmptyState } from "@/components/ui/empty-state";
import type { CaseStatus, Severity } from "@/lib/api/types";

const STATUSES: CaseStatus[] = [
  "OPEN",
  "TRIAGING",
  "INVESTIGATING",
  "ESCALATED",
  "MITIGATING",
  "VERIFYING",
  "RESOLVED",
];
const SEVERITIES: Severity[] = ["low", "medium", "high", "critical"];

// Next.js 16's searchParams type allows a repeated query param (e.g.
// "?status=OPEN&status=TRIAGING") to arrive as a string[] -- confirmed
// against this version's own bundled docs
// (node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md),
// not assumed from prior training data per apps/web/AGENTS.md's warning.
// Every filter here is single-valued, so only the first value is used.
function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function CasesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const user = await verifySession();

  const status = firstValue(params.status);
  const severity = firstValue(params.severity);
  const assigneeId = firstValue(params.assigneeId);
  const offset = firstValue(params.offset);

  const filters = {
    status: STATUSES.includes(status as CaseStatus) ? (status as CaseStatus) : undefined,
    severity: SEVERITIES.includes(severity as Severity) ? (severity as Severity) : undefined,
    // Only meaningful for a Lead -- the backend ignores this for an
    // Analyst and always scopes their list to themselves regardless
    // (apps/api/src/cases/cases.service.ts's findAll()).
    assigneeId: user.role === "lead" ? assigneeId : undefined,
    limit: 25,
    offset: offset && !Number.isNaN(Number(offset)) ? Number(offset) : 0,
  };

  const [{ data: cases, total }, users] = await Promise.all([listCases(filters), listUsers()]);
  const userNames = buildUserNameMap(users);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Cases</h1>
        <a
          href="/cases/new"
          className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/80 dark:bg-white dark:text-black dark:hover:bg-white/80"
        >
          New case
        </a>
      </div>

      <form method="GET" className="flex flex-wrap items-end gap-4">
        <label className="space-y-1 text-sm">
          <span className="block font-medium">Status</span>
          <select name="status" defaultValue={status ?? ""} className="rounded-md border border-black/20 px-3 py-2 dark:border-white/20 dark:bg-transparent">
            <option value="">Any</option>
            {STATUSES.map((statusOption) => (
              <option key={statusOption} value={statusOption}>
                {statusOption}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="block font-medium">Severity</span>
          <select name="severity" defaultValue={severity ?? ""} className="rounded-md border border-black/20 px-3 py-2 dark:border-white/20 dark:bg-transparent">
            <option value="">Any</option>
            {SEVERITIES.map((severityOption) => (
              <option key={severityOption} value={severityOption}>
                {severityOption}
              </option>
            ))}
          </select>
        </label>
        {user.role === "lead" && (
          <label className="space-y-1 text-sm">
            <span className="block font-medium">Assignee</span>
            <select name="assigneeId" defaultValue={assigneeId ?? ""} className="rounded-md border border-black/20 px-3 py-2 dark:border-white/20 dark:bg-transparent">
              <option value="">Anyone</option>
              {users.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          type="submit"
          className="rounded-md border border-black/20 px-4 py-2 text-sm dark:border-white/20"
        >
          Apply filters
        </button>
      </form>

      {cases.length === 0 ? (
        <EmptyState title="No cases match these filters" />
      ) : (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-black/10 dark:border-white/10">
              <th className="py-2 font-medium">Title</th>
              <th className="py-2 font-medium">Status</th>
              <th className="py-2 font-medium">Severity</th>
              <th className="py-2 font-medium">Assignee</th>
            </tr>
          </thead>
          <tbody>
            {cases.map((kase) => (
              <tr key={kase.id} className="border-b border-black/5 dark:border-white/5">
                <td className="py-2">
                  <a href={`/cases/${kase.id}`} className="underline">
                    {kase.title}
                  </a>
                </td>
                <td className="py-2">{kase.status}</td>
                <td className="py-2">{kase.severity}</td>
                <td className="py-2">{resolveUserName(userNames, kase.assigneeId)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="text-sm text-black/60 dark:text-white/60">
        Showing {cases.length} of {total} case{total === 1 ? "" : "s"}.
      </p>
    </div>
  );
}
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `npx jest app/\(workspace\)/cases/page.test.tsx`
Expected: PASS, 5/5 tests.

- [ ] **Step 10: Run the full verification bar**

`npx jest && npx tsc --noEmit && npm run build && npm run lint`

- [ ] **Step 11: Commit**

```bash
git add apps/web/lib/nav.ts apps/web/lib/nav.test.ts apps/web/app/\(workspace\)/cases/page.tsx apps/web/app/\(workspace\)/cases/page.test.tsx
git commit -m "feat(web): add case list page with status/severity/assignee filters"
```

---

## Task 6: Case creation page

**Files:**
- Create: `apps/web/app/(workspace)/cases/new/page.tsx`
- Create: `apps/web/app/(workspace)/cases/new/case-form.tsx`
- Create: `apps/web/app/(workspace)/cases/new/actions.ts`
- Test: `apps/web/app/(workspace)/cases/new/case-form.test.tsx`

**Interfaces:**
- Consumes: `verifySession()`; `listUsers` (Task 3); `createCase` (Task 4); `Button`, `TextField`, `FormError` (existing).
- Produces: the `/cases/new` route; `createCaseAction(prevState, formData)`.

- [ ] **Step 1: Write the failing test for the create-case form**

Create `apps/web/app/(workspace)/cases/new/case-form.test.tsx`:

```tsx
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { CaseForm } from "./case-form";

describe("CaseForm", () => {
  it("does not render an assignee select for an Analyst", () => {
    render(<CaseForm role="analyst" activeUsers={[]} />);
    expect(screen.queryByLabelText(/assign to/i)).not.toBeInTheDocument();
  });

  it("renders an assignee select for a Lead, listing only active users", () => {
    render(
      <CaseForm
        role="lead"
        activeUsers={[
          { id: "u1", name: "Ada Lovelace" },
          { id: "u2", name: "Grace Hopper" },
        ]}
      />,
    );
    const select = screen.getByLabelText(/assign to/i);
    expect(select).toBeInTheDocument();
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("Grace Hopper")).toBeInTheDocument();
  });

  it("always renders a title field and a severity select", () => {
    render(<CaseForm role="analyst" activeUsers={[]} />);
    expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/severity/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest cases/new/case-form.test.tsx`
Expected: FAIL with "Cannot find module './case-form'"

- [ ] **Step 3: Implement `actions.ts`**

Create `apps/web/app/(workspace)/cases/new/actions.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { createCase } from "@/features/cases/service";
import { ApiError } from "@/lib/server/api-client";
import type { Severity } from "@/lib/api/types";

export interface CaseFormState {
  error?: string;
}

export async function createCaseAction(
  _prevState: CaseFormState,
  formData: FormData,
): Promise<CaseFormState> {
  const title = String(formData.get("title") ?? "").trim();
  const severity = String(formData.get("severity") ?? "") as Severity;
  const assigneeId = formData.get("assigneeId");

  if (!title) {
    return { error: "Title is required." };
  }
  if (!["low", "medium", "high", "critical"].includes(severity)) {
    return { error: "Severity is required." };
  }

  try {
    const created = await createCase({
      title,
      severity,
      assigneeId: typeof assigneeId === "string" && assigneeId ? assigneeId : undefined,
    });
    redirect(`/cases/${created.id}`);
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: error.message };
    }
    return { error: "Something went wrong. Please try again." };
  }
}
```

- [ ] **Step 4: Implement `case-form.tsx`**

Create `apps/web/app/(workspace)/cases/new/case-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { createCaseAction, type CaseFormState } from "./actions";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { FormError } from "@/components/ui/form-error";
import type { UserRole } from "@/lib/api/types";

const initialState: CaseFormState = {};

export function CaseForm({
  role,
  activeUsers,
}: {
  role: UserRole;
  activeUsers: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(createCaseAction, initialState);

  return (
    <form action={formAction} className="max-w-md space-y-4">
      <TextField label="Title" name="title" required maxLength={200} />
      <div className="space-y-1">
        <label htmlFor="severity" className="block text-sm font-medium">
          Severity
        </label>
        <select
          id="severity"
          name="severity"
          required
          className="w-full rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent"
        >
          <option value="">Select severity</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </select>
      </div>
      {role === "lead" && (
        <div className="space-y-1">
          <label htmlFor="assigneeId" className="block text-sm font-medium">
            Assign to
          </label>
          <select
            id="assigneeId"
            name="assigneeId"
            className="w-full rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent"
          >
            <option value="">Myself</option>
            {activeUsers.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {state.error && <FormError message={state.error} />}
      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create case"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx jest cases/new/case-form.test.tsx`
Expected: PASS, 3/3 tests.

- [ ] **Step 6: Implement the page**

Create `apps/web/app/(workspace)/cases/new/page.tsx`:

```tsx
import { verifySession } from "@/features/auth/dal";
import { listUsers } from "@/features/users/service";
import { CaseForm } from "./case-form";

export default async function NewCasePage() {
  const user = await verifySession();
  const users = user.role === "lead" ? await listUsers() : [];
  const activeUsers = users.filter((candidate) => !candidate.disabledAt);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">New case</h1>
      <CaseForm role={user.role} activeUsers={activeUsers} />
    </div>
  );
}
```

- [ ] **Step 7: Run the full verification bar**

`npx jest && npx tsc --noEmit && npm run build && npm run lint`

- [ ] **Step 8: Commit**

```bash
git add apps/web/app/\(workspace\)/cases/new/
git commit -m "feat(web): add case creation page"
```

---

## Task 7: Case detail page (read view)

**Files:**
- Create: `apps/web/app/(workspace)/cases/[id]/page.tsx`
- Test: `apps/web/app/(workspace)/cases/[id]/page.test.tsx`

**Interfaces:**
- Consumes: `verifySession()`; `getCase` (Task 4); `listUsers` (Task 3); `resolveUserName` (Task 3); `ApiError` (`lib/server/api-client.ts`, unchanged).
- Produces: the `/cases/[id]` route's read-only rendering (transition controls and notes/comments are added in Tasks 8-9 as additional sections of this same file).

- [ ] **Step 1: Write the failing test**

Create `apps/web/app/(workspace)/cases/[id]/page.test.tsx`:

```tsx
/** @jest-environment node */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";

jest.mock("@/features/auth/dal", () => ({ verifySession: jest.fn() }));
jest.mock("@/features/cases/service", () => ({
  getCase: jest.fn(),
  listCaseTimelineEntries: jest.fn(),
}));
jest.mock("@/features/users/service", () => ({ listUsers: jest.fn() }));

import { verifySession } from "@/features/auth/dal";
import { getCase, listCaseTimelineEntries } from "@/features/cases/service";
import { listUsers } from "@/features/users/service";
import { ApiError } from "@/lib/server/api-client";
import CaseDetailPage from "./page";

const kase = {
  id: "c1",
  title: "Suspicious login",
  status: "INVESTIGATING",
  severity: "high",
  assigneeId: "u1",
  resolutionSummary: null,
  createdAt: "2026-08-19T00:00:00.000Z",
  updatedAt: "2026-08-19T00:00:00.000Z",
  alerts: [{ id: "a1", source: "manual", summary: "Odd login time", severity: "medium", status: "linked", dismissReason: null, createdAt: "2026-08-19T00:00:00.000Z" }],
};

describe("CaseDetailPage", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (verifySession as jest.Mock).mockResolvedValue({ id: "u1", name: "Ada Lovelace", role: "analyst" });
    (listUsers as jest.Mock).mockResolvedValue([{ id: "u1", name: "Ada Lovelace", role: "analyst", disabledAt: null }]);
    (listCaseTimelineEntries as jest.Mock).mockResolvedValue({ data: [], total: 0, limit: 100, offset: 0 });
  });

  it("renders the case's title, status, severity, and assignee name", async () => {
    (getCase as jest.Mock).mockResolvedValue(kase);

    const jsx = await CaseDetailPage({ params: Promise.resolve({ id: "c1" }) });
    render(jsx);

    expect(screen.getByText("Suspicious login")).toBeInTheDocument();
    expect(screen.getByText("INVESTIGATING")).toBeInTheDocument();
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
  });

  it("renders linked alerts read-only, with no action controls", async () => {
    (getCase as jest.Mock).mockResolvedValue(kase);

    const jsx = await CaseDetailPage({ params: Promise.resolve({ id: "c1" }) });
    render(jsx);

    expect(screen.getByText("Odd login time")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /dismiss/i })).not.toBeInTheDocument();
  });

  it("renders the resolution summary only when the case is RESOLVED", async () => {
    (getCase as jest.Mock).mockResolvedValue({
      ...kase,
      status: "RESOLVED",
      resolutionSummary: "Confirmed benign, closed.",
    });

    const jsx = await CaseDetailPage({ params: Promise.resolve({ id: "c1" }) });
    render(jsx);

    expect(screen.getByText("Confirmed benign, closed.")).toBeInTheDocument();
  });

  it("renders a clear message when the case is forbidden (403)", async () => {
    (getCase as jest.Mock).mockRejectedValue(new ApiError(403, "You do not have access to this case"));

    const jsx = await CaseDetailPage({ params: Promise.resolve({ id: "c1" }) });
    render(jsx);

    expect(screen.getByText(/don't have access/i)).toBeInTheDocument();
  });

  it("renders a clear message when the case does not exist (404)", async () => {
    (getCase as jest.Mock).mockRejectedValue(new ApiError(404, "Case not found"));

    const jsx = await CaseDetailPage({ params: Promise.resolve({ id: "does-not-exist" }) });
    render(jsx);

    expect(screen.getByText(/case not found/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest cases/\[id\]/page.test.tsx`
Expected: FAIL with "Cannot find module './page'"

- [ ] **Step 3: Implement the page's read-only shell**

Create `apps/web/app/(workspace)/cases/[id]/page.tsx`:

```tsx
import { verifySession } from "@/features/auth/dal";
import { getCase, listCaseTimelineEntries } from "@/features/cases/service";
import { listUsers } from "@/features/users/service";
import { buildUserNameMap, resolveUserName } from "@/lib/format-user";
import { ApiError } from "@/lib/server/api-client";
import { EmptyState } from "@/components/ui/empty-state";

export default async function CaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await verifySession();

  let kase;
  try {
    kase = await getCase(id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      return (
        <EmptyState
          title="You don't have access to this case"
          description="Only the case's assignee or a Lead can view it."
        />
      );
    }
    if (error instanceof ApiError && error.status === 404) {
      return <EmptyState title="Case not found" description={`No case matches id "${id}".`} />;
    }
    throw error;
  }

  const [users, timeline] = await Promise.all([listUsers(), listCaseTimelineEntries(id)]);
  const userNames = buildUserNameMap(users);

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">{kase.title}</h1>
        <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-black/60 dark:text-white/60">Status</dt>
            <dd>{kase.status}</dd>
          </div>
          <div>
            <dt className="text-black/60 dark:text-white/60">Severity</dt>
            <dd>{kase.severity}</dd>
          </div>
          <div>
            <dt className="text-black/60 dark:text-white/60">Assignee</dt>
            <dd>{resolveUserName(userNames, kase.assigneeId)}</dd>
          </div>
          <div>
            <dt className="text-black/60 dark:text-white/60">Created</dt>
            <dd>{new Date(kase.createdAt).toLocaleString()}</dd>
          </div>
        </dl>
        {kase.status === "RESOLVED" && kase.resolutionSummary && (
          <p className="rounded-md border border-black/10 p-4 text-sm dark:border-white/10">
            <span className="font-medium">Resolution: </span>
            {kase.resolutionSummary}
          </p>
        )}
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-black/60 dark:text-white/60">
          Linked alerts
        </h2>
        {kase.alerts.length === 0 ? (
          <p className="text-sm text-black/60 dark:text-white/60">No alerts linked to this case.</p>
        ) : (
          <ul className="space-y-2">
            {kase.alerts.map((alert) => (
              <li key={alert.id} className="rounded-md border border-black/10 p-3 text-sm dark:border-white/10">
                <span className="font-medium">{alert.summary}</span>
                <span className="text-black/60 dark:text-white/60"> · {alert.severity} · {alert.source}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Lifecycle transition controls and reassignment (Task 8), and the
          Notes & Comments section (Task 9), are added here as additional
          sections in their own tasks -- this task only covers the
          read-only view. */}
      <p data-testid="case-detail-placeholder" className="hidden">
        {JSON.stringify({ user: user.role, timelineTotal: timeline.total })}
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest cases/\[id\]/page.test.tsx`
Expected: PASS, 5/5 tests.

- [ ] **Step 5: Run the full verification bar**

`npx jest && npx tsc --noEmit && npm run build && npm run lint`

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/\(workspace\)/cases/\[id\]/
git commit -m "feat(web): add case detail page with read-only view and 403/404 handling"
```

---

## Task 8: Lifecycle transition controls and reassignment

**Files:**
- Create: `apps/web/app/(workspace)/cases/[id]/actions.ts`
- Create: `apps/web/app/(workspace)/cases/[id]/transition-button.tsx`
- Create: `apps/web/app/(workspace)/cases/[id]/reassign-form.tsx`
- Test: `apps/web/app/(workspace)/cases/[id]/transition-button.test.tsx`
- Test: `apps/web/app/(workspace)/cases/[id]/reassign-form.test.tsx`
- Modify: `apps/web/app/(workspace)/cases/[id]/page.tsx`

**Interfaces:**
- Consumes: `getAvailableActions`, `CaseTransitionRule` (Task 2); `transitionCase`, `reassignCase` (Task 4); `listUsers` (Task 3); `Button`, `FormError` (existing).
- Produces: `transitionCaseAction`, `reassignCaseAction` (both `(prevState, formData) => Promise<{error?: string}>`); `<TransitionButton>`, `<ReassignForm>`.

- [ ] **Step 1: Write the failing tests for `TransitionButton`**

Create `apps/web/app/(workspace)/cases/[id]/transition-button.test.tsx`:

```tsx
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { TransitionButton } from "./transition-button";
import type { CaseTransitionRule } from "@/lib/case-transitions";

const rule: CaseTransitionRule = {
  action: "begin_triage",
  from: "OPEN",
  to: "TRIAGING",
  roles: ["analyst", "lead"],
  requiresResolutionSummary: false,
};

const resolveRule: CaseTransitionRule = {
  action: "resolve",
  from: "VERIFYING",
  to: "RESOLVED",
  roles: ["analyst", "lead"],
  requiresResolutionSummary: true,
};

describe("TransitionButton", () => {
  it("renders a submit button labeled with the action", () => {
    render(<TransitionButton caseId="c1" rule={rule} />);
    expect(screen.getByRole("button", { name: /begin triage/i })).toBeInTheDocument();
  });

  it("renders a required resolution summary field only for the resolve action", () => {
    render(<TransitionButton caseId="c1" rule={resolveRule} />);
    expect(screen.getByLabelText(/resolution summary/i)).toBeRequired();
  });

  it("does not render a resolution summary field for a non-resolve action", () => {
    render(<TransitionButton caseId="c1" rule={rule} />);
    expect(screen.queryByLabelText(/resolution summary/i)).not.toBeInTheDocument();
  });

  it("includes the case id as a hidden field", () => {
    const { container } = render(<TransitionButton caseId="c1" rule={rule} />);
    const hidden = container.querySelector('input[type="hidden"][name="caseId"]');
    expect(hidden).toHaveValue("c1");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest transition-button.test.tsx`
Expected: FAIL with "Cannot find module './transition-button'"

- [ ] **Step 3: Write the failing tests for `ReassignForm`**

Create `apps/web/app/(workspace)/cases/[id]/reassign-form.test.tsx`:

```tsx
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { ReassignForm } from "./reassign-form";

describe("ReassignForm", () => {
  it("lists only the given active users as options", () => {
    render(
      <ReassignForm
        caseId="c1"
        activeUsers={[
          { id: "u1", name: "Ada Lovelace" },
          { id: "u2", name: "Grace Hopper" },
        ]}
      />,
    );
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("Grace Hopper")).toBeInTheDocument();
  });

  it("includes the case id as a hidden field", () => {
    const { container } = render(<ReassignForm caseId="c1" activeUsers={[]} />);
    const hidden = container.querySelector('input[type="hidden"][name="caseId"]');
    expect(hidden).toHaveValue("c1");
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx jest reassign-form.test.tsx`
Expected: FAIL with "Cannot find module './reassign-form'"

- [ ] **Step 5: Implement `actions.ts`**

Create `apps/web/app/(workspace)/cases/[id]/actions.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { addComment, addNote, reassignCase, transitionCase } from "@/features/cases/service";
import { ApiError } from "@/lib/server/api-client";
import type { CaseAction } from "@/lib/api/types";

export interface CaseActionState {
  error?: string;
}

function caseIdOf(formData: FormData): string {
  return String(formData.get("caseId") ?? "");
}

export async function transitionCaseAction(
  _prevState: CaseActionState,
  formData: FormData,
): Promise<CaseActionState> {
  const caseId = caseIdOf(formData);
  const action = String(formData.get("action") ?? "") as CaseAction;
  const resolutionSummary = formData.get("resolutionSummary");

  try {
    await transitionCase(
      caseId,
      action,
      typeof resolutionSummary === "string" && resolutionSummary ? resolutionSummary : undefined,
    );
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: error.message };
    }
    return { error: "Something went wrong. Please try again." };
  }
  redirect(`/cases/${caseId}`);
}

export async function reassignCaseAction(
  _prevState: CaseActionState,
  formData: FormData,
): Promise<CaseActionState> {
  const caseId = caseIdOf(formData);
  const assigneeId = String(formData.get("assigneeId") ?? "");

  if (!assigneeId) {
    return { error: "Choose a user to reassign to." };
  }

  try {
    await reassignCase(caseId, assigneeId);
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: error.message };
    }
    return { error: "Something went wrong. Please try again." };
  }
  redirect(`/cases/${caseId}`);
}

export async function addNoteAction(
  _prevState: CaseActionState,
  formData: FormData,
): Promise<CaseActionState> {
  const caseId = caseIdOf(formData);
  const content = String(formData.get("content") ?? "").trim();

  if (!content) {
    return { error: "Note content is required." };
  }

  try {
    await addNote(caseId, content);
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: error.message };
    }
    return { error: "Something went wrong. Please try again." };
  }
  redirect(`/cases/${caseId}`);
}

export async function addCommentAction(
  _prevState: CaseActionState,
  formData: FormData,
): Promise<CaseActionState> {
  const caseId = caseIdOf(formData);
  const content = String(formData.get("content") ?? "").trim();

  if (!content) {
    return { error: "Comment content is required." };
  }

  try {
    await addComment(caseId, content);
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: error.message };
    }
    return { error: "Something went wrong. Please try again." };
  }
  redirect(`/cases/${caseId}`);
}
```

- [ ] **Step 6: Implement `TransitionButton`**

Create `apps/web/app/(workspace)/cases/[id]/transition-button.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { transitionCaseAction, type CaseActionState } from "./actions";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form-error";
import type { CaseTransitionRule } from "@/lib/case-transitions";

const initialState: CaseActionState = {};

const ACTION_LABELS: Record<CaseTransitionRule["action"], string> = {
  begin_triage: "Begin triage",
  start_investigation: "Start investigation",
  escalate: "Escalate",
  accept_escalation: "Accept escalation",
  begin_mitigation: "Begin mitigation",
  begin_verification: "Begin verification",
  resolve: "Resolve",
  reopen: "Reopen",
};

export function TransitionButton({
  caseId,
  rule,
}: {
  caseId: string;
  rule: CaseTransitionRule;
}) {
  const [state, formAction, pending] = useActionState(transitionCaseAction, initialState);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="caseId" value={caseId} />
      <input type="hidden" name="action" value={rule.action} />
      {rule.requiresResolutionSummary && (
        <div className="space-y-1">
          <label htmlFor={`resolutionSummary-${rule.action}`} className="block text-sm font-medium">
            Resolution summary
          </label>
          <textarea
            id={`resolutionSummary-${rule.action}`}
            name="resolutionSummary"
            required
            maxLength={2000}
            className="w-full rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent"
          />
        </div>
      )}
      {state.error && <FormError message={state.error} />}
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Working…" : ACTION_LABELS[rule.action]}
      </Button>
    </form>
  );
}
```

- [ ] **Step 7: Implement `ReassignForm`**

Create `apps/web/app/(workspace)/cases/[id]/reassign-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { reassignCaseAction, type CaseActionState } from "./actions";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form-error";

const initialState: CaseActionState = {};

export function ReassignForm({
  caseId,
  activeUsers,
}: {
  caseId: string;
  activeUsers: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(reassignCaseAction, initialState);

  return (
    <form action={formAction} className="flex items-end gap-2">
      <input type="hidden" name="caseId" value={caseId} />
      <div className="space-y-1">
        <label htmlFor="reassign-assigneeId" className="block text-sm font-medium">
          Reassign to
        </label>
        <select
          id="reassign-assigneeId"
          name="assigneeId"
          required
          className="rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent"
        >
          <option value="">Choose a user</option>
          {activeUsers.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.name}
            </option>
          ))}
        </select>
      </div>
      {state.error && <FormError message={state.error} />}
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Reassigning…" : "Reassign"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 8: Run the component tests to verify they pass**

Run: `npx jest transition-button.test.tsx reassign-form.test.tsx`
Expected: PASS, 6/6 tests.

- [ ] **Step 9: Wire both into the case detail page**

In `apps/web/app/(workspace)/cases/[id]/page.tsx`, add the imports:

```tsx
import { getAvailableActions } from "@/lib/case-transitions";
import { TransitionButton } from "./transition-button";
import { ReassignForm } from "./reassign-form";
```

Replace the placeholder paragraph at the bottom of the read-only body (`<p data-testid="case-detail-placeholder" ...>`) with:

```tsx
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-black/60 dark:text-white/60">
          Actions
        </h2>
        <div className="flex flex-wrap gap-4">
          {getAvailableActions(kase.status, user.role).map((rule) => (
            <TransitionButton key={rule.action} caseId={kase.id} rule={rule} />
          ))}
        </div>
        {user.role === "lead" && (
          <ReassignForm
            caseId={kase.id}
            activeUsers={users.filter((candidate) => !candidate.disabledAt && candidate.id !== kase.assigneeId)}
          />
        )}
      </section>
```

- [ ] **Step 10: Update the case-detail page test for the new sections**

Add these two test cases to `apps/web/app/(workspace)/cases/[id]/page.test.tsx` (append to the existing `describe` block):

```tsx
  it("renders only the transition buttons valid for the current status and role", async () => {
    (getCase as jest.Mock).mockResolvedValue(kase); // status: INVESTIGATING, analyst
    const jsx = await CaseDetailPage({ params: Promise.resolve({ id: "c1" }) });
    render(jsx);

    expect(screen.getByRole("button", { name: /escalate/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /begin mitigation/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /accept escalation/i })).not.toBeInTheDocument();
  });

  it("does not render the reassign form for an Analyst", async () => {
    (getCase as jest.Mock).mockResolvedValue(kase);
    const jsx = await CaseDetailPage({ params: Promise.resolve({ id: "c1" }) });
    render(jsx);

    expect(screen.queryByLabelText(/reassign to/i)).not.toBeInTheDocument();
  });

  it("renders the reassign form for a Lead", async () => {
    (verifySession as jest.Mock).mockResolvedValue({ id: "u2", name: "Grace Hopper", role: "lead" });
    (getCase as jest.Mock).mockResolvedValue(kase);
    (listUsers as jest.Mock).mockResolvedValue([
      { id: "u1", name: "Ada Lovelace", role: "analyst", disabledAt: null },
      { id: "u2", name: "Grace Hopper", role: "lead", disabledAt: null },
    ]);

    const jsx = await CaseDetailPage({ params: Promise.resolve({ id: "c1" }) });
    render(jsx);

    expect(screen.getByLabelText(/reassign to/i)).toBeInTheDocument();
  });
```

- [ ] **Step 11: Run the test to verify it passes**

Run: `npx jest cases/\[id\]/page.test.tsx`
Expected: PASS, 8/8 tests.

- [ ] **Step 12: Run the full verification bar**

`npx jest && npx tsc --noEmit && npm run build && npm run lint`

- [ ] **Step 13: Commit**

```bash
git add apps/web/app/\(workspace\)/cases/\[id\]/
git commit -m "feat(web): add lifecycle transition controls and Lead-only reassignment"
```

---

## Task 9: Notes & Comments section

**Files:**
- Create: `apps/web/app/(workspace)/cases/[id]/case-entry-form.tsx`
- Test: `apps/web/app/(workspace)/cases/[id]/case-entry-form.test.tsx`
- Modify: `apps/web/app/(workspace)/cases/[id]/page.tsx`
- Modify: `apps/web/app/(workspace)/cases/[id]/page.test.tsx`

**Interfaces:**
- Consumes: `extractHumanEntries`, `HumanEntry` (Task 1); `addNoteAction`, `addCommentAction` (Task 8); `TextField`, `FormError`, `Button` (existing).
- Produces: `<CaseEntryForm>`; the Notes & Comments section of the case detail page.

- [ ] **Step 1: Write the failing test for `CaseEntryForm`**

Create `apps/web/app/(workspace)/cases/[id]/case-entry-form.test.tsx`:

```tsx
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { CaseEntryForm } from "./case-entry-form";
import { addNoteAction } from "./actions";

describe("CaseEntryForm", () => {
  it("renders a labeled textarea and a submit button for the given kind", () => {
    render(<CaseEntryForm caseId="c1" kind="note" action={addNoteAction} />);
    expect(screen.getByLabelText(/note/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add note/i })).toBeInTheDocument();
  });

  it("includes the case id as a hidden field", () => {
    const { container } = render(<CaseEntryForm caseId="c1" kind="comment" action={addNoteAction} />);
    const hidden = container.querySelector('input[type="hidden"][name="caseId"]');
    expect(hidden).toHaveValue("c1");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest case-entry-form.test.tsx`
Expected: FAIL with "Cannot find module './case-entry-form'"

- [ ] **Step 3: Implement `CaseEntryForm`**

Create `apps/web/app/(workspace)/cases/[id]/case-entry-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import type { CaseActionState } from "./actions";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form-error";

const initialState: CaseActionState = {};

const KIND_LABEL: Record<"note" | "comment", string> = {
  note: "Note",
  comment: "Comment",
};

export function CaseEntryForm({
  caseId,
  kind,
  action,
}: {
  caseId: string;
  kind: "note" | "comment";
  action: (prevState: CaseActionState, formData: FormData) => Promise<CaseActionState>;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const fieldId = `${kind}-content-${caseId}`;

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="caseId" value={caseId} />
      <div className="space-y-1">
        <label htmlFor={fieldId} className="block text-sm font-medium">
          {KIND_LABEL[kind]}
        </label>
        <textarea
          id={fieldId}
          name="content"
          required
          maxLength={2000}
          className="w-full rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent"
        />
      </div>
      {state.error && <FormError message={state.error} />}
      <Button type="submit" disabled={pending}>
        {pending ? "Adding…" : `Add ${kind}`}
      </Button>
    </form>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest case-entry-form.test.tsx`
Expected: PASS, 2/2 tests.

- [ ] **Step 5: Wire the Notes & Comments section into the case detail page**

In `apps/web/app/(workspace)/cases/[id]/page.tsx`, add the imports:

```tsx
import { extractHumanEntries } from "@/lib/case-notes";
import { CaseEntryForm } from "./case-entry-form";
import { addCommentAction, addNoteAction } from "./actions";
```

Add this constant above the component (module scope):

```tsx
const NOTES_AND_COMMENTS_LIMIT = 100;
```

Add this section immediately after the "Actions" `<section>` added in Task 8 (before the closing `</div>` of the page's root element):

```tsx
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-black/60 dark:text-white/60">
          Notes & Comments
        </h2>
        {timeline.total > NOTES_AND_COMMENTS_LIMIT && (
          <p className="text-xs text-black/50 dark:text-white/50">
            Showing the latest {NOTES_AND_COMMENTS_LIMIT} timeline entries; earlier entries are not shown here.
          </p>
        )}
        {(() => {
          const entries = extractHumanEntries(timeline.data);
          return entries.length === 0 ? (
            <p className="text-sm text-black/60 dark:text-white/60">No notes or comments yet.</p>
          ) : (
            <ul className="space-y-3">
              {entries.map((entry) => (
                <li key={entry.id} className="rounded-md border border-black/10 p-3 text-sm dark:border-white/10">
                  <div className="flex items-center justify-between text-xs text-black/60 dark:text-white/60">
                    <span>
                      {entry.kind === "note" ? "Note" : "Comment"} by {entry.authorName}
                    </span>
                    <span>{new Date(entry.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="mt-1">{entry.text}</p>
                </li>
              ))}
            </ul>
          );
        })()}
        {kase.status !== "RESOLVED" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <CaseEntryForm caseId={kase.id} kind="note" action={addNoteAction} />
            <CaseEntryForm caseId={kase.id} kind="comment" action={addCommentAction} />
          </div>
        )}
      </section>
```

- [ ] **Step 6: Add page-level tests for the Notes & Comments section**

Append to the existing `describe` block in `apps/web/app/(workspace)/cases/[id]/page.test.tsx`:

```tsx
  it("renders notes and comments extracted from the timeline, and excludes system events", async () => {
    (getCase as jest.Mock).mockResolvedValue(kase);
    (listCaseTimelineEntries as jest.Mock).mockResolvedValue({
      data: [
        {
          id: "e1",
          caseId: "c1",
          type: "comment",
          authorId: "u1",
          content: { text: "Agreed, escalating" },
          createdAt: "2026-08-19T01:00:00.000Z",
          author: { id: "u1", name: "Ada Lovelace", role: "analyst" },
        },
        {
          id: "e2",
          caseId: "c1",
          type: "note",
          authorId: "u1",
          content: { event: "assignee_changed", fromAssigneeId: "u1", toAssigneeId: "u2" },
          createdAt: "2026-08-19T00:30:00.000Z",
          author: { id: "u1", name: "Ada Lovelace", role: "analyst" },
        },
      ],
      total: 2,
      limit: 100,
      offset: 0,
    });

    const jsx = await CaseDetailPage({ params: Promise.resolve({ id: "c1" }) });
    render(jsx);

    expect(screen.getByText("Agreed, escalating")).toBeInTheDocument();
    expect(screen.queryByText(/assignee_changed/i)).not.toBeInTheDocument();
  });

  it("shows add-note and add-comment forms when the case is not resolved", async () => {
    (getCase as jest.Mock).mockResolvedValue(kase);
    const jsx = await CaseDetailPage({ params: Promise.resolve({ id: "c1" }) });
    render(jsx);

    expect(screen.getByRole("button", { name: /add note/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add comment/i })).toBeInTheDocument();
  });

  it("hides add-note and add-comment forms when the case is resolved", async () => {
    (getCase as jest.Mock).mockResolvedValue({ ...kase, status: "RESOLVED", resolutionSummary: "Done." });
    const jsx = await CaseDetailPage({ params: Promise.resolve({ id: "c1" }) });
    render(jsx);

    expect(screen.queryByRole("button", { name: /add note/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add comment/i })).not.toBeInTheDocument();
  });
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx jest cases/\[id\]/page.test.tsx`
Expected: PASS, 11/11 tests.

- [ ] **Step 8: Run the full verification bar**

`npx jest && npx tsc --noEmit && npm run build && npm run lint`

- [ ] **Step 9: Commit**

```bash
git add apps/web/app/\(workspace\)/cases/\[id\]/
git commit -m "feat(web): add Notes & Comments section to case detail, filtered from the timeline"
```

---

## Task 10: Full-suite verification and live manual walkthrough

**Files:** None created or modified — this task is verification only.

**Interfaces:** N/A.

- [ ] **Step 1: Run the complete automated verification bar**

From `apps/web/`:

```bash
npx jest
npx tsc --noEmit
npm run build
npm run lint
```

All four must be clean. Record the exact test/suite counts.

- [ ] **Step 2: Start the real backend and a live dev server**

Using this project's existing dev-database setup (`kestro-postgres-dev`, per `docs/PROGRESS.md`'s "Dev database" note), start the NestJS API and run `npm run dev` (or the project's equivalent) for `apps/web`.

- [ ] **Step 3: Manually walk the full Cases Workspace flow as an Analyst**

1. Log in as an Analyst.
2. Navigate to `/cases` via the new "Cases" nav item — confirm the empty state renders if no cases exist yet.
3. Create a case via `/cases/new` (no assignee field should be visible) — confirm redirect to the new case's detail page.
4. On the detail page, confirm only `begin_triage` is offered (status `OPEN`), and that no reassign form is visible.
5. Run `begin_triage`, then `start_investigation` — confirm each redirects back to the same page with the updated status and the next actions' buttons.
6. Add a note and a comment — confirm both appear in the Notes & Comments section, attributed to the Analyst, and that no `assignee_changed`-type system events ever appear there.
7. Run the full forward lifecycle to `resolve` — confirm the resolution-summary field is required, confirm the resolved case's summary displays, and confirm the add-note/add-comment forms disappear once resolved.
8. Attempt to view a case belonging to a different Analyst (create a second Analyst account and case via the API directly, or via a Lead) — confirm the 403 message renders cleanly, not a crash.
9. Attempt to view a nonexistent case id — confirm the 404 message renders cleanly.

- [ ] **Step 4: Manually walk the Lead-only paths**

1. Log in as a Lead.
2. Confirm `/cases` shows every case, and that the assignee filter select is visible and functional.
3. Create a case assigned to a different (active) user — confirm it appears in that user's list, not the Lead's own, and that the Lead can still view it.
4. On a case in `ESCALATED` status, confirm `accept_escalation` is offered to the Lead and not to an Analyst who views the same case (if they have access).
5. Use the reassign form to move a case to a different active user — confirm the assignee updates and a disabled user never appears as an option.
6. On a `RESOLVED` case, confirm `reopen` is offered only to the Lead.

- [ ] **Step 5: Confirm no backend drift**

Run `npx prisma validate` and `npx prisma migrate status` from `apps/api/` — both must show no changes, confirming this milestone made zero backend/schema modifications, matching the Global Constraints.

- [ ] **Step 6: Update `docs/PROGRESS.md`**

Add a "Phase 2 — Milestone 2: Cases Workspace" entry (following the existing style of the "Operations Workspace Foundation — implementation notes" subsection): what was built, the notes/comments-via-filtered-timeline decision and why, confirmation of zero backend changes, and the verification results (test counts, tsc/build/lint status, manual walkthrough confirmation). Update "## Current task" and "## Next planned milestone" accordingly, matching the precedent already set for Milestone 1.

- [ ] **Step 7: Commit the documentation update**

```bash
git add docs/PROGRESS.md
git commit -m "docs: record Phase 2 Milestone 2 — Cases Workspace completion"
```

---

## Self-Review

**Spec coverage** — every numbered item from the approved specification maps to a task: user stories → Tasks 5-9 collectively; case-list capabilities → Task 5; case-detail capabilities → Tasks 7-9; lifecycle transitions per role → Tasks 2, 8; notes/comments behavior → Tasks 1, 9; read-only vs. mutable fields → Task 7 (display) enforced server-side throughout; loading/empty/error states → Tasks 5, 7 (`EmptyState`, inline 403/404, existing `loading.tsx`/`error.tsx` inherited for free); authorization behavior → enforced server-side already, rendered conditionally in Tasks 5, 6, 8; navigation/routes → Task 5 (nav entry), file structure throughout; API calls → Task 4; backend capabilities consumed as-is → Task 4 (zero backend changes, per Global Constraints); the one backend gap (notes/comments read-back) → resolved by product decision (b), implemented in Tasks 1, 4, 9; excluded scope → Global Constraints, reiterated per-task; acceptance criteria → Task 10's manual walkthrough steps map 1:1 to the specification's §14 list; test strategy → unit (Tasks 1-4), component (Tasks 5-9), manual/live (Task 10) — matches the specification's §15 exactly.

**Placeholder scan** — no task contains "TBD," "add appropriate," or an unshown code block; every step that changes code shows the complete code, not a description of it.

**Type consistency** — checked across tasks: `Case`/`CaseWithAlerts`/`CaseStatus`/`CaseAction`/`Severity`/`Alert`/`TimelineEventWithAuthor`/`PaginatedCases`/`PaginatedTimelineEvents` (Task 1) are the only names later tasks import, and every later task's mock/test data matches those shapes field-for-field (e.g. `resolutionSummary: string | null`, not `resolution_summary`). `getAvailableActions(status, role)` (Task 2) is called with exactly that signature in Task 8. `listCases`/`getCase`/`createCase`/`transitionCase`/`reassignCase`/`addNote`/`addComment`/`listCaseTimelineEntries` (Task 4) are the exact names Tasks 5-9 import — no task invents a differently-named equivalent. `extractHumanEntries` (Task 1) and `CaseActionState`/`transitionCaseAction`/`reassignCaseAction`/`addNoteAction`/`addCommentAction` (Task 8) are used with matching names and signatures in Task 9.
