# Alert Triage Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give an Analyst or Lead a UI over the shared alert queue — list/filter, view detail (including raw payload), dismiss with a required reason, link an alert to an existing accessible case, or create a new case from one or several selected alerts — closing the one gap in the documented Alert → Case workflow that today only exists via direct API calls.

**Architecture:** Pure extension of the existing Next.js 16 Server-Component + Server-Action + typed-service-layer pattern already proven by the Cases Workspace, reusing every existing UI primitive (`Badge`, `Card`, `Section`, `Button`, `EmptyState`, `FormError`, `TextField`) with zero new primitives. One narrowly-scoped backend hardening change (map a Prisma unique-constraint race to a 409) is included; no other backend/schema/auth change.

**Tech Stack:** Next.js 16 (App Router, Server Components, Server Actions), TypeScript, Tailwind CSS, Jest + React Testing Library (frontend); NestJS + Prisma 7 + Jest (backend).

**Spec:** This plan implements the decisions the project owner approved in conversation on 2026-08-20, following the "Alert Domain Discovery" read-only investigation (same conversation, same date) that established backend readiness. There is no separate spec document — the approved decisions are restated verbatim in Global Constraints below, and this plan's own Discovery Notes section records the exact current-repository facts the task designs depend on.

## Global Constraints

- Alert Triage Workspace is the next Phase 2 milestone.
- Scope: alert list with status/severity filters and pagination; alert detail including raw payload; dismiss-with-reason; link alert to an existing accessible case; create a new case from one or multiple selected alerts.
- Reuse the existing Cases Workspace capabilities and the existing UI design system (`Badge`, severity/status tones, `Card`, `Section`, `Button`, Server Components, Server Actions, typed service layer). No new UI framework, no redesign of the existing visual language.
- Do NOT build in this milestone: AI, correlation/deduplication, alert ownership/visibility scoping, alert search, dashboard/metrics, Investigation/Evidence UI, or bulk operations (bulk dismiss, bulk link). The one explicitly-approved exception is multi-alert selection feeding *only* into case creation (`alertIds[]`), which is not a "bulk operation" for this constraint's purposes.
- Keep the current model where any authenticated Analyst or Lead sees the shared alert queue (no per-user alert ownership).
- Approve and implement exactly one backend hardening change: map the alert-linking Prisma uniqueness race (`P2002`) to a proper 409 `ConflictException`. Keep it narrowly scoped to that one race; no other backend redesign, no new endpoints, no schema change.
- Create-case-from-alert supports one or multiple selected alerts through the existing `CreateCaseDto.alertIds[]` capability — no new backend field.
- Existing-case linking uses the existing `POST /cases/:id/alerts` endpoint as-is; only the UI needed to select an accessible case is new (no new backend filter/search endpoint for "my cases").
- AI is not implemented. The three explicit human triage decisions (dismiss / link / create-case) must remain narrow, named actions — never a generic "edit alert" — so a future AI-suggestion layer has one unambiguous thing to attach beside each, per `docs/ARCHITECTURE.md`'s "distinct, attributed record, human explicitly reviews and accepts" model.
- No source files were modified during discovery/planning; this document is the first write.

## Discovery Notes (verified against the current repository, not assumed)

These facts were re-verified directly against the repository at the start of this planning pass (not taken from the earlier discovery's summarized fork output) and are load-bearing for the task designs below:

- **Alert model** (`apps/api/prisma/schema.prisma:133-155`): `id, source, summary, rawPayload (Json?), severity, status (default "new"), dismissReason, dismissedById, dismissedAt, createdAt`. No `updatedAt`, no `createdById`, no direct case reference — `caseAlert CaseAlert?` is the only relation, and no controller method currently `include`s it, so **`GET /alerts/:id` cannot report which case a `linked` alert belongs to**. This is an accepted limitation for this milestone (see Task 7) — not fixed, since it would require a backend change beyond the one approved.
- **Alerts controller/service** (`apps/api/src/alerts/{alerts.controller,alerts.service}.ts`): `POST /alerts`, `GET /alerts` (status/severity/limit/offset only), `GET /alerts/:id`, `POST /alerts/:id/dismiss` (`{reason}`, only legal from `status: new`, sets `dismissedById`/`dismissedAt`, no timeline event). No `RolesGuard`/`@Roles` anywhere — confirmed deliberate per the controller's own comment.
- **The race this plan fixes** (`apps/api/src/cases/cases.service.ts:316-330`, `179-213`, `37-87`): `assertAlertsLinkable` reads each alert's `status` in a plain `await` **before** the `$transaction` that actually inserts the `CaseAlert` row starts. Two concurrent requests for the same still-`new` alert can both pass that read before either commits; the DB's unique index on `CaseAlert.alertId` then rejects the loser's insert with Prisma error code `P2002`, which today propagates unmapped through the global exception filter as an unhandled 500.
- **Existing test-mock pattern for exactly this kind of race**: `apps/api/src/auth/auth.service.spec.ts`'s "prevents concurrent reuse of the same refresh token" test is the established precedent — the codebase deliberately covers this class of race at the **unit level only**, with a synchronous in-memory mock, not at the e2e level (`auth.e2e-spec.ts` has no matching concurrent test). This plan's Task 1 follows that same precedent rather than introducing a new, less deterministic e2e concurrency test.
- **Frontend `Alert` type** (`apps/web/lib/api/types.ts`): currently `{id, source, summary, severity, status, dismissReason, createdAt}` — missing `rawPayload`, `dismissedById`, `dismissedAt`, which the backend already returns on every Alert row today (the nested `CaseWithAlerts.alerts` comes from `CasesService.withAlerts()`'s `include: { alert: true }`, i.e. full, unfiltered Alert rows) — extending the type is purely corrective, not a behavior change.
- **No alerts frontend code exists today** beyond the read-only "Linked alerts" list already on the case detail page (`apps/web/app/(workspace)/cases/[id]/page.tsx`), which renders `alert.summary`, a `Badge` for `alert.severity`, and `alert.source`, with zero action controls. This plan does not modify that section.
- **Case creation today** (`apps/web/app/(workspace)/cases/new/{page.tsx,case-form.tsx,actions.ts}`) has no `alertIds` support at all on the frontend, even though the backend has accepted `alertIds[]` at case-creation time since Milestone 1.
- **`features/cases/service.ts`** has no `linkAlertToCase` function today (no frontend code calls `POST /cases/:id/alerts` at all).
- **Next.js 16 convention already established and reused here**: `searchParams` is a `Promise<{[key: string]: string | string[] | undefined}>`, confirmed against this version's own bundled docs by `apps/web/app/(workspace)/cases/page.tsx`'s existing comment (per `apps/web/AGENTS.md`'s warning not to assume prior-training-data Next.js behavior). This plan's new pages follow the identical pattern.

## Task 1: Backend hardening — map the alert-linking P2002 race to 409

**Files:**
- Modify: `apps/api/src/cases/cases.service.ts`
- Modify: `apps/api/src/cases/cases.service.spec.ts`

**Interfaces:**
- Consumes: `Prisma.PrismaClientKnownRequestError` (runtime class exported from `apps/api/generated/prisma/client.ts`'s `Prisma` namespace), `Prisma.TransactionClient` (type from the same namespace).
- Produces: `CasesService`'s existing public methods (`create`, `linkAlert`) now throw `ConflictException` instead of letting a `P2002` escape as an unmapped 500. No signature changes — nothing downstream (Task 3's frontend service layer) needs to change because of this task.

- [ ] **Step 1: Write the failing unit tests**

Add to the `describe('linkAlert', ...)` block in `apps/api/src/cases/cases.service.spec.ts` (after the existing `'rejects linking an already-linked alert'` test, i.e. after line 579):

```ts
    it('maps a concurrent link race (P2002) to 409 instead of leaking a raw Prisma error', async () => {
      const mock = createPrismaMock({
        users: activeUsers,
        alerts: [{ id: 'alert-1', status: AlertStatus.new }],
      });
      mock.cases.set('c', makeCase({ id: 'c', status: CaseStatus.OPEN }));
      // Simulates the exact race window this fix closes: another request's
      // caseAlert.create already committed a row for this alertId (hence
      // this pre-seeded row) between this request's own assertAlertsLinkable
      // read -- which still sees "new", since that read already happened --
      // and this request's own caseAlert.create.
      mock.caseAlerts.set('existing', {
        id: 'existing',
        caseId: 'other-case',
        alertId: 'alert-1',
      });
      const service = new CasesService(mock.prisma);

      await expect(
        service.linkAlert(analyst, 'c', { alertId: 'alert-1' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
```

Add to the `describe('create', ...)` block (after the existing `'rejects linking an unknown alert'` test, i.e. after line 357):

```ts
    it('maps a concurrent link race (P2002) to 409 when linking at case creation', async () => {
      const { service, caseAlerts } = createService({
        alerts: [{ id: 'alert-1', status: AlertStatus.new }],
      });
      caseAlerts.set('existing', {
        id: 'existing',
        caseId: 'other-case',
        alertId: 'alert-1',
      });

      await expect(
        service.create(analyst, {
          title: 'x',
          severity: Severity.medium,
          alertIds: ['alert-1'],
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
```

Now update the mock's `caseAlert.create` (lines 159-168 of the same file) to actually enforce the unique index the real database enforces, so these two new tests exercise the real code path instead of trivially passing:

```ts
    caseAlert: {
      create: ({
        data,
      }: {
        data: { caseId: string; alertId: string };
      }): FakeCaseAlertRow => {
        const alreadyLinked = [...caseAlerts.values()].some(
          (row) => row.alertId === data.alertId,
        );
        if (alreadyLinked) {
          // Mirrors the real case_alerts.alert_id unique index (Postgres
          // raises this as a unique-violation, which Prisma surfaces as
          // P2002) so a race that reaches this point in the mock behaves
          // like the real database instead of an unconstrained Map.
          throw new Prisma.PrismaClientKnownRequestError(
            'Unique constraint failed on the fields: (`alert_id`)',
            { code: 'P2002', clientVersion: 'test' },
          );
        }
        const row: FakeCaseAlertRow = { id: `ca-${nextId++}`, ...data };
        caseAlerts.set(row.id, row);
        return row;
      },
      findMany: ({
        where,
      }: {
        where: { caseId: string };
      }): (FakeCaseAlertRow & { alert: FakeAlertRow })[] =>
        [...caseAlerts.values()]
          .filter((ca) => ca.caseId === where.caseId)
          .map((ca) => ({ ...ca, alert: alerts.get(ca.alertId)! })),
    },
```

Add `Prisma` to this file's existing import from the generated client (currently `import { AlertStatus, CaseStatus, Severity, UserRole } from '../../generated/prisma/client';` at the top of the file):

```ts
import {
  AlertStatus,
  CaseStatus,
  Prisma,
  Severity,
  UserRole,
} from '../../generated/prisma/client';
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && npx jest cases.service.spec.ts -t "P2002"`
Expected: both new tests FAIL — the mock now throws `PrismaClientKnownRequestError`, and `CasesService` does not yet catch it, so the promise rejects with that raw error instead of `ConflictException`, and `toBeInstanceOf(ConflictException)` fails.

- [ ] **Step 3: Implement the fix in `cases.service.ts`**

Change the import block at the top of `apps/api/src/cases/cases.service.ts` from:

```ts
import type {
  Case,
  Prisma,
  TimelineEvent,
} from '../../generated/prisma/client';
import {
  AlertStatus,
  CaseStatus,
  UserRole,
} from '../../generated/prisma/client';
```

to (moving `Prisma` from the type-only import to the runtime import, since `Prisma.PrismaClientKnownRequestError` must exist as a real class at runtime for `instanceof` to work — `Prisma`'s existing type-only usages elsewhere in this file, e.g. `Prisma.CaseWhereInput`, remain valid because the namespace exports both runtime members and types):

```ts
import type { Case, TimelineEvent } from '../../generated/prisma/client';
import {
  AlertStatus,
  CaseStatus,
  Prisma,
  UserRole,
} from '../../generated/prisma/client';
```

Add a new private method, placed directly above `assertAlertsLinkable` (currently at line 316):

```ts
  // assertAlertsLinkable (above) reads each alert's status outside this
  // transaction, so two concurrent requests for the same still-"new" alert
  // can both pass that read before either commits. CaseAlert.alertId's
  // unique index is the real backstop for that race; this turns the
  // resulting P2002 into the same 409 assertAlertsLinkable would have
  // thrown had it re-checked a moment later, instead of an unmapped 500.
  private async createCaseAlertLink(
    tx: Prisma.TransactionClient,
    caseId: string,
    alertId: string,
  ): Promise<void> {
    try {
      await tx.caseAlert.create({ data: { caseId, alertId } });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          `Alert ${alertId} was linked to another case concurrently`,
        );
      }
      throw error;
    }
  }
```

In `create()`, replace the loop body's direct `caseAlert.create` call (currently):

```ts
      for (const alertId of alertIds) {
        await tx.caseAlert.create({
          data: { caseId: kase.id, alertId },
        });
        await tx.alert.update({
```

with:

```ts
      for (const alertId of alertIds) {
        await this.createCaseAlertLink(tx, kase.id, alertId);
        await tx.alert.update({
```

In `linkAlert()`, replace the direct `caseAlert.create` call (currently):

```ts
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.caseAlert.create({
        data: { caseId: id, alertId: dto.alertId },
      });
      await tx.alert.update({
```

with:

```ts
    const updated = await this.prisma.$transaction(async (tx) => {
      await this.createCaseAlertLink(tx, id, dto.alertId);
      await tx.alert.update({
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && npx jest cases.service.spec.ts`
Expected: all tests in the file PASS, including the two new ones.

- [ ] **Step 5: Verify no regressions across the full backend suite**

Run: `cd apps/api && npx jest && npx tsc --noEmit && npm run lint`
Expected: unit tests 127/127 passing (was 125; +2 for this task), `tsc` clean (confirms `Prisma.TransactionClient` is structurally assignable from `$transaction`'s inferred callback parameter — if it is not, use the exact type Prisma actually infers there instead, found via hovering/`tsc`'s error message), lint clean.

Run: `cd apps/api && npm run test:e2e`
Expected: 98/98 e2e tests still passing (this task changes no request/response shape, only which exception class wraps an already-rare failure mode, so no existing e2e assertion should be affected).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/cases/cases.service.ts apps/api/src/cases/cases.service.spec.ts
git commit -m "fix(api): map alert-linking P2002 race to 409 instead of an unmapped 500"
```

## Task 2: Frontend types and badge tones for Alerts

**Files:**
- Modify: `apps/web/lib/api/types.ts`
- Modify: `apps/web/lib/badge-tones.ts`
- Modify: `apps/web/lib/badge-tones.test.ts`

**Interfaces:**
- Consumes: `BadgeTone` from `apps/web/components/ui/badge.tsx` (unchanged).
- Produces: `PaginatedAlerts` type; extended `Alert` type (adds `rawPayload`, `dismissedById`, `dismissedAt`); `ALERT_STATUS_BADGE_TONE: Record<AlertStatus, BadgeTone>` — all three consumed by Task 3 (service layer) and Tasks 5-7 (pages/components).

- [ ] **Step 1: Extend the `Alert` and add `PaginatedAlerts` types**

In `apps/web/lib/api/types.ts`, replace the existing `Alert` interface (currently):

```ts
export interface Alert {
  id: string;
  source: string;
  summary: string;
  severity: Severity;
  status: AlertStatus;
  dismissReason: string | null;
  createdAt: string;
}
```

with:

```ts
export interface Alert {
  id: string;
  source: string;
  summary: string;
  severity: Severity;
  status: AlertStatus;
  dismissReason: string | null;
  dismissedById: string | null;
  dismissedAt: string | null;
  rawPayload: Record<string, unknown> | null;
  createdAt: string;
}
```

Add a new `PaginatedAlerts` interface, placed directly after the existing `PaginatedCases` interface:

```ts
export interface PaginatedAlerts {
  data: Alert[];
  total: number;
  limit: number;
  offset: number;
}
```

- [ ] **Step 2: Run `tsc` to find any now-incomplete `Alert` literals**

Run: `cd apps/web && npx tsc --noEmit`
Expected: this may surface a type error in `apps/web/app/(workspace)/cases/[id]/page.test.tsx`, whose existing `kase.alerts` fixture (`{ id: "a1", source: "manual", summary: "Odd login time", severity: "medium", status: "linked", dismissReason: null, createdAt: "2026-08-19T00:00:00.000Z" }`) is missing the three new fields. If it does, add `dismissedById: null, dismissedAt: null, rawPayload: null` to that one object literal. If `tsc` is clean without this change (because the mock's return type isn't structurally checked at that call site), leave it as-is — do not add unused fields defensively.

- [ ] **Step 3: Add `ALERT_STATUS_BADGE_TONE`**

In `apps/web/lib/badge-tones.ts`, add `AlertStatus` to the existing type import (currently `import type { CaseStatus, Severity } from "./api/types";`):

```ts
import type { AlertStatus, CaseStatus, Severity } from "./api/types";
```

Add, after the existing `CASE_STATUS_BADGE_TONE` export:

```ts
// new = unactioned (matches CaseStatus.OPEN's neutral treatment); linked =
// successfully triaged into a case (a positive outcome, like RESOLVED);
// dismissed = closed without further action, given a color distinct from
// both so a scanning analyst can tell "still in my queue" (new) apart from
// either terminal outcome at a glance.
export const ALERT_STATUS_BADGE_TONE: Record<AlertStatus, BadgeTone> = {
  new: "neutral",
  linked: "green",
  dismissed: "purple",
};
```

- [ ] **Step 4: Write the failing test for tone completeness**

Add to `apps/web/lib/badge-tones.test.ts`, importing `ALERT_STATUS_BADGE_TONE` and `AlertStatus` alongside the existing imports:

```ts
import {
  ALERT_STATUS_BADGE_TONE,
  CASE_STATUS_BADGE_TONE,
  SEVERITY_BADGE_TONE,
} from "./badge-tones";
import type { AlertStatus, CaseStatus, Severity } from "./api/types";
```

```ts
  it("maps every AlertStatus value to a tone", () => {
    const statuses: AlertStatus[] = ["new", "linked", "dismissed"];
    for (const status of statuses) {
      expect(ALERT_STATUS_BADGE_TONE[status]).toBeDefined();
    }
  });
```

- [ ] **Step 5: Run the test to verify it passes** (it should already pass, since Step 3 preceded it — this step exists to confirm the map and the test agree)

Run: `cd apps/web && npx jest badge-tones.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/api/types.ts apps/web/lib/badge-tones.ts apps/web/lib/badge-tones.test.ts apps/web/app/\(workspace\)/cases/\[id\]/page.test.tsx
git commit -m "feat(web): extend Alert type and add alert-status badge tones"
```

## Task 3: Frontend service layer — `features/alerts/service.ts` and `features/cases/service.ts` additions

**Files:**
- Create: `apps/web/features/alerts/service.ts`
- Create: `apps/web/features/alerts/service.test.ts`
- Modify: `apps/web/features/cases/service.ts`
- Modify: `apps/web/features/cases/service.test.ts`

**Interfaces:**
- Consumes: `apiFetch<T>` from `apps/web/lib/server/api-client.ts` (unchanged); `Alert`, `AlertStatus`, `Severity`, `PaginatedAlerts`, `CaseWithAlerts` types from Task 2 / existing `lib/api/types.ts`.
- Produces: `listAlerts(filters: ListAlertsFilters): Promise<PaginatedAlerts>`, `getAlert(id: string): Promise<Alert>`, `dismissAlert(id: string, reason: string): Promise<Alert>` (new module `features/alerts/service.ts`); `linkAlertToCase(caseId: string, alertId: string): Promise<CaseWithAlerts>` and an extended `CreateCaseInput` (adds `alertIds?: string[]`) on the existing `features/cases/service.ts`. Tasks 5-8 call these directly.

- [ ] **Step 1: Write the failing tests for `features/alerts/service.ts`**

Create `apps/web/features/alerts/service.test.ts`:

```ts
/** @jest-environment node */
jest.mock("../../lib/server/api-client", () => {
  const actual = jest.requireActual("../../lib/server/api-client");
  return { ...actual, apiFetch: jest.fn() };
});

import { apiFetch } from "../../lib/server/api-client";
import { dismissAlert, getAlert, listAlerts } from "./service";

describe("alerts service", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("listAlerts builds a query string from only the provided filters", async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ data: [], total: 0, limit: 25, offset: 0 });
    await listAlerts({ status: "new", severity: "high", limit: 10, offset: 20 });
    expect(apiFetch).toHaveBeenCalledWith("/alerts?status=new&severity=high&limit=10&offset=20");
  });

  it("listAlerts omits filters that are undefined", async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ data: [], total: 0, limit: 25, offset: 0 });
    await listAlerts({});
    expect(apiFetch).toHaveBeenCalledWith("/alerts?");
  });

  it("getAlert calls GET /alerts/:id", async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ id: "a1" });
    await getAlert("a1");
    expect(apiFetch).toHaveBeenCalledWith("/alerts/a1");
  });

  it("dismissAlert posts the reason to /alerts/:id/dismiss", async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ id: "a1" });
    await dismissAlert("a1", "False positive");
    expect(apiFetch).toHaveBeenCalledWith("/alerts/a1/dismiss", {
      method: "POST",
      body: JSON.stringify({ reason: "False positive" }),
    });
  });

  it("encodes the alert id when building the request path", async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ id: "a1" });
    await getAlert("has space/slash");
    expect(apiFetch).toHaveBeenCalledWith("/alerts/has%20space%2Fslash");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && npx jest features/alerts/service.test.ts`
Expected: FAIL with "Cannot find module './service'" (the module doesn't exist yet).

- [ ] **Step 3: Implement `features/alerts/service.ts`**

Create `apps/web/features/alerts/service.ts`:

```ts
import "server-only";
import { apiFetch } from "../../lib/server/api-client";
import type { Alert, AlertStatus, PaginatedAlerts, Severity } from "../../lib/api/types";

export interface ListAlertsFilters {
  status?: AlertStatus;
  severity?: Severity;
  limit?: number;
  offset?: number;
}

export async function listAlerts(filters: ListAlertsFilters): Promise<PaginatedAlerts> {
  const params = new URLSearchParams();
  if (filters.status !== undefined) params.set("status", filters.status);
  if (filters.severity !== undefined) params.set("severity", filters.severity);
  if (filters.limit !== undefined) params.set("limit", String(filters.limit));
  if (filters.offset !== undefined) params.set("offset", String(filters.offset));
  return apiFetch<PaginatedAlerts>(`/alerts?${params.toString()}`);
}

export async function getAlert(id: string): Promise<Alert> {
  return apiFetch<Alert>(`/alerts/${encodeURIComponent(id)}`);
}

export async function dismissAlert(id: string, reason: string): Promise<Alert> {
  return apiFetch<Alert>(`/alerts/${encodeURIComponent(id)}/dismiss`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && npx jest features/alerts/service.test.ts`
Expected: PASS (5/5).

- [ ] **Step 5: Write the failing tests for `features/cases/service.ts` additions**

Add to `apps/web/features/cases/service.test.ts`'s import list (currently `import { addComment, addNote, createCase, getCase, listCases, listCaseTimelineEntries, reassignCase, transitionCase } from "./service";`):

```ts
import {
  addComment,
  addNote,
  createCase,
  getCase,
  linkAlertToCase,
  listCases,
  listCaseTimelineEntries,
  reassignCase,
  transitionCase,
} from "./service";
```

Add these two tests (after the existing `"createCase omits assigneeId when not provided"` test):

```ts
  it("createCase includes alertIds when provided", async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ id: "c1" });
    await createCase({ title: "x", severity: "high", alertIds: ["a1", "a2"] });
    expect(apiFetch).toHaveBeenCalledWith("/cases", {
      method: "POST",
      body: JSON.stringify({ title: "x", severity: "high", alertIds: ["a1", "a2"] }),
    });
  });

  it("linkAlertToCase posts the alertId to /cases/:id/alerts", async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ id: "c1" });
    await linkAlertToCase("c1", "a1");
    expect(apiFetch).toHaveBeenCalledWith("/cases/c1/alerts", {
      method: "POST",
      body: JSON.stringify({ alertId: "a1" }),
    });
  });
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `cd apps/web && npx jest features/cases/service.test.ts`
Expected: FAIL — `linkAlertToCase` is not exported yet, and `createCase`'s current `CreateCaseInput` type doesn't accept `alertIds` (a `tsc`/Jest-transform error, or a runtime call that succeeds but whose assertion fails because `alertIds` was silently dropped — either way, not passing as written).

- [ ] **Step 7: Implement the `features/cases/service.ts` additions**

Replace the existing `CreateCaseInput` interface and `createCase` function (currently):

```ts
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
```

with:

```ts
export interface CreateCaseInput {
  title: string;
  severity: Severity;
  assigneeId?: string;
  alertIds?: string[];
}

export async function createCase(input: CreateCaseInput): Promise<CaseWithAlerts> {
  return apiFetch<CaseWithAlerts>("/cases", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
```

Add, after the existing `reassignCase` function:

```ts
export async function linkAlertToCase(caseId: string, alertId: string): Promise<CaseWithAlerts> {
  return apiFetch<CaseWithAlerts>(`/cases/${encodeURIComponent(caseId)}/alerts`, {
    method: "POST",
    body: JSON.stringify({ alertId }),
  });
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `cd apps/web && npx jest features/cases/service.test.ts features/alerts/service.test.ts`
Expected: PASS, all tests including the two new ones and all pre-existing ones (the `createCase` body assertions for calls that don't pass `alertIds` are unaffected, since `JSON.stringify` drops an `undefined`-valued property).

- [ ] **Step 9: Commit**

```bash
git add apps/web/features/alerts/service.ts apps/web/features/alerts/service.test.ts apps/web/features/cases/service.ts apps/web/features/cases/service.test.ts
git commit -m "feat(web): add alerts service layer and case-linking/alertIds support to cases service"
```

## Task 4: Navigation — add Alerts

**Files:**
- Modify: `apps/web/lib/nav.ts`
- Modify: `apps/web/lib/nav.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `NAV_ITEMS` now includes `/alerts`; `getVisibleNavItems` behavior unchanged (still pure role-filtering).

- [ ] **Step 1: Write the failing test**

In `apps/web/lib/nav.test.ts`, change:

```ts
  it("only lists routes that actually exist in this milestone", () => {
    expect(NAV_ITEMS.map((item) => item.href)).toEqual(["/", "/cases"]);
  });
```

to:

```ts
  it("only lists routes that actually exist in this milestone", () => {
    expect(NAV_ITEMS.map((item) => item.href)).toEqual(["/", "/cases", "/alerts"]);
  });
```

Add, after the existing `"includes Cases for both analyst and lead"` test:

```ts
  it("includes Alerts for both analyst and lead", () => {
    expect(getVisibleNavItems("analyst").map((item) => item.href)).toContain("/alerts");
    expect(getVisibleNavItems("lead").map((item) => item.href)).toContain("/alerts");
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && npx jest nav.test.ts`
Expected: FAIL — `NAV_ITEMS` doesn't yet include `/alerts`.

- [ ] **Step 3: Implement**

In `apps/web/lib/nav.ts`, replace the `NAV_ITEMS` array and its preceding comment (currently):

```ts
// Registry of workspace nav destinations, shared across every feature (not
// owned by any one of them). Only "Workspace" and "Cases" are real routes
// today -- Alerts/Dashboard/Investigation/Evidence/Timeline are later Phase 2
// milestones (see docs/PROGRESS.md) and are deliberately not listed here
// yet, so this foundation never links to a page that doesn't exist. Later
// milestones add entries here; the filtering mechanism below does not
// change.
export const NAV_ITEMS: NavItem[] = [
  { label: "Workspace", href: "/", roles: ["analyst", "lead"] },
  { label: "Cases", href: "/cases", roles: ["analyst", "lead"] },
];
```

with:

```ts
// Registry of workspace nav destinations, shared across every feature (not
// owned by any one of them). Only "Workspace", "Cases", and "Alerts" are
// real routes today -- Dashboard/Investigation/Evidence/Timeline are later
// Phase 2 milestones (see docs/PROGRESS.md) and are deliberately not listed
// here yet, so this foundation never links to a page that doesn't exist.
// Later milestones add entries here; the filtering mechanism below does not
// change.
export const NAV_ITEMS: NavItem[] = [
  { label: "Workspace", href: "/", roles: ["analyst", "lead"] },
  { label: "Cases", href: "/cases", roles: ["analyst", "lead"] },
  { label: "Alerts", href: "/alerts", roles: ["analyst", "lead"] },
];
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && npx jest nav.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/nav.ts apps/web/lib/nav.test.ts
git commit -m "feat(web): add Alerts to the workspace nav"
```

## Task 5: Alert detail action components — dismiss and link-to-case

**Files:**
- Create: `apps/web/app/(workspace)/alerts/[id]/actions.ts`
- Create: `apps/web/app/(workspace)/alerts/[id]/dismiss-form.tsx`
- Create: `apps/web/app/(workspace)/alerts/[id]/dismiss-form.test.tsx`
- Create: `apps/web/app/(workspace)/alerts/[id]/link-to-case-form.tsx`
- Create: `apps/web/app/(workspace)/alerts/[id]/link-to-case-form.test.tsx`

**Interfaces:**
- Consumes: `dismissAlert` (Task 3, `features/alerts/service.ts`), `linkAlertToCase` (Task 3, `features/cases/service.ts`), `ApiError` (`lib/server/api-client.ts`), `Button`/`FormError` UI primitives.
- Produces: `AlertActionState { error?: string }`, `dismissAlertAction`, `linkAlertToCaseAction` (Server Actions), `<DismissForm alertId={string} />`, `<LinkToCaseForm alertId={string} cases={{id: string; title: string}[]} />` — both consumed by Task 6's page.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/app/(workspace)/alerts/[id]/dismiss-form.test.tsx`:

```tsx
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { DismissForm } from "./dismiss-form";

describe("DismissForm", () => {
  it("renders a required reason field and a dismiss button", () => {
    render(<DismissForm alertId="a1" />);
    expect(screen.getByLabelText(/dismiss reason/i)).toBeRequired();
    expect(screen.getByRole("button", { name: /dismiss/i })).toBeInTheDocument();
  });

  it("includes the alert id as a hidden field", () => {
    const { container } = render(<DismissForm alertId="a1" />);
    const hidden = container.querySelector('input[type="hidden"][name="alertId"]');
    expect(hidden).toHaveValue("a1");
  });

  it("uses the warning button styling, matching other consequential, irreversible actions", () => {
    render(<DismissForm alertId="a1" />);
    expect(screen.getByRole("button", { name: /dismiss/i })).toHaveClass("bg-amber-600");
  });
});
```

Create `apps/web/app/(workspace)/alerts/[id]/link-to-case-form.test.tsx`:

```tsx
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { LinkToCaseForm } from "./link-to-case-form";

describe("LinkToCaseForm", () => {
  it("renders a case select populated from the given cases", () => {
    render(<LinkToCaseForm alertId="a1" cases={[{ id: "c1", title: "Suspicious login" }]} />);
    expect(screen.getByLabelText(/link to an existing case/i)).toBeInTheDocument();
    expect(screen.getByText("Suspicious login")).toBeInTheDocument();
  });

  it("disables the submit button when there are no accessible cases", () => {
    render(<LinkToCaseForm alertId="a1" cases={[]} />);
    expect(screen.getByRole("button", { name: /link to case/i })).toBeDisabled();
  });

  it("includes the alert id as a hidden field", () => {
    const { container } = render(<LinkToCaseForm alertId="a1" cases={[]} />);
    const hidden = container.querySelector('input[type="hidden"][name="alertId"]');
    expect(hidden).toHaveValue("a1");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && npx jest dismiss-form.test.tsx link-to-case-form.test.tsx`
Expected: FAIL — neither component module exists yet.

- [ ] **Step 3: Implement `actions.ts`**

Create `apps/web/app/(workspace)/alerts/[id]/actions.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { dismissAlert } from "@/features/alerts/service";
import { linkAlertToCase } from "@/features/cases/service";
import { ApiError } from "@/lib/server/api-client";

export interface AlertActionState {
  error?: string;
}

export async function dismissAlertAction(
  _prevState: AlertActionState,
  formData: FormData,
): Promise<AlertActionState> {
  const alertId = String(formData.get("alertId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (!reason) {
    return { error: "A dismiss reason is required." };
  }

  try {
    await dismissAlert(alertId, reason);
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: error.message };
    }
    return { error: "Something went wrong. Please try again." };
  }
  redirect(`/alerts/${alertId}`);
}

export async function linkAlertToCaseAction(
  _prevState: AlertActionState,
  formData: FormData,
): Promise<AlertActionState> {
  const alertId = String(formData.get("alertId") ?? "");
  const caseId = String(formData.get("caseId") ?? "");

  if (!caseId) {
    return { error: "Choose a case to link to." };
  }

  try {
    await linkAlertToCase(caseId, alertId);
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: error.message };
    }
    return { error: "Something went wrong. Please try again." };
  }
  redirect(`/alerts/${alertId}`);
}
```

- [ ] **Step 4: Implement `dismiss-form.tsx`**

Create `apps/web/app/(workspace)/alerts/[id]/dismiss-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { dismissAlertAction, type AlertActionState } from "./actions";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form-error";

const initialState: AlertActionState = {};

export function DismissForm({ alertId }: { alertId: string }) {
  const [state, formAction, pending] = useActionState(dismissAlertAction, initialState);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="alertId" value={alertId} />
      <div className="space-y-1">
        <label htmlFor={`dismiss-reason-${alertId}`} className="block text-sm font-medium">
          Dismiss reason
        </label>
        <textarea
          id={`dismiss-reason-${alertId}`}
          name="reason"
          required
          maxLength={500}
          className="w-full rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent"
        />
      </div>
      {state.error && <FormError message={state.error} />}
      <Button type="submit" variant="warning" disabled={pending}>
        {pending ? "Dismissing…" : "Dismiss"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 5: Implement `link-to-case-form.tsx`**

Create `apps/web/app/(workspace)/alerts/[id]/link-to-case-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { linkAlertToCaseAction, type AlertActionState } from "./actions";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form-error";

const initialState: AlertActionState = {};

export function LinkToCaseForm({
  alertId,
  cases,
}: {
  alertId: string;
  cases: { id: string; title: string }[];
}) {
  const [state, formAction, pending] = useActionState(linkAlertToCaseAction, initialState);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="alertId" value={alertId} />
      <div className="space-y-1">
        <label htmlFor={`link-caseId-${alertId}`} className="block text-sm font-medium">
          Link to an existing case
        </label>
        <select
          id={`link-caseId-${alertId}`}
          name="caseId"
          required
          className="w-full rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent"
        >
          <option value="">Choose a case</option>
          {cases.map((kase) => (
            <option key={kase.id} value={kase.id}>
              {kase.title}
            </option>
          ))}
        </select>
      </div>
      {state.error && <FormError message={state.error} />}
      <Button type="submit" variant="secondary" disabled={pending || cases.length === 0}>
        {pending ? "Linking…" : "Link to case"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd apps/web && npx jest dismiss-form.test.tsx link-to-case-form.test.tsx`
Expected: PASS (3/3 each).

- [ ] **Step 7: Commit**

```bash
git add "apps/web/app/(workspace)/alerts/[id]/actions.ts" "apps/web/app/(workspace)/alerts/[id]/dismiss-form.tsx" "apps/web/app/(workspace)/alerts/[id]/dismiss-form.test.tsx" "apps/web/app/(workspace)/alerts/[id]/link-to-case-form.tsx" "apps/web/app/(workspace)/alerts/[id]/link-to-case-form.test.tsx"
git commit -m "feat(web): add alert dismiss and link-to-case Server Actions and forms"
```

## Task 6: Alert detail page

**Files:**
- Create: `apps/web/app/(workspace)/alerts/[id]/page.tsx`
- Create: `apps/web/app/(workspace)/alerts/[id]/page.test.tsx`

**Interfaces:**
- Consumes: `getAlert` (Task 3), `listCases` (existing, `features/cases/service.ts`), `listUsers` (existing, `features/users/service.ts`), `buildUserNameMap`/`resolveUserName` (existing, `lib/format-user.ts`), `ApiError`, `EmptyState`, `Badge`, `Card`, `Section` (all existing primitives), `ALERT_STATUS_BADGE_TONE`/`SEVERITY_BADGE_TONE` (Task 2), `DismissForm`/`LinkToCaseForm` (Task 5).
- Produces: the `/alerts/[id]` route. Task 8 links to it (`/cases/new?alertIds=...`) but does not import from it.

- [ ] **Step 1: Write the failing test**

Create `apps/web/app/(workspace)/alerts/[id]/page.test.tsx`:

```tsx
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";

// Relative (not "@/...") specifiers deliberately: this codebase's Jest setup
// rewrites path aliases at transform time via SWC, which does not rewrite the
// string literal inside a jest.mock() call. Matches every other page.test.tsx
// in this codebase.
jest.mock("../../../../features/alerts/service", () => ({ getAlert: jest.fn() }));
jest.mock("../../../../features/cases/service", () => ({ listCases: jest.fn() }));
jest.mock("../../../../features/users/service", () => ({ listUsers: jest.fn() }));

import { getAlert } from "../../../../features/alerts/service";
import { listCases } from "../../../../features/cases/service";
import { listUsers } from "../../../../features/users/service";
import { ApiError } from "@/lib/server/api-client";
import AlertDetailPage from "./page";

function makeAlert(overrides: Record<string, unknown> = {}) {
  return {
    id: "a1",
    source: "manual",
    summary: "Suspicious login",
    severity: "high",
    status: "new",
    dismissReason: null,
    dismissedById: null,
    dismissedAt: null,
    rawPayload: null,
    createdAt: "2026-08-20T00:00:00.000Z",
    ...overrides,
  };
}

describe("AlertDetailPage", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (listCases as jest.Mock).mockResolvedValue({ data: [], total: 0, limit: 100, offset: 0 });
    (listUsers as jest.Mock).mockResolvedValue([]);
  });

  it("renders the alert's summary, status, and severity", async () => {
    (getAlert as jest.Mock).mockResolvedValue(makeAlert());
    const jsx = await AlertDetailPage({ params: Promise.resolve({ id: "a1" }) });
    render(jsx);
    expect(screen.getByText("Suspicious login")).toBeInTheDocument();
    expect(screen.getByText("new")).toBeInTheDocument();
  });

  it("renders a clear message when the alert does not exist (404)", async () => {
    (getAlert as jest.Mock).mockRejectedValue(new ApiError(404, "Alert not found"));
    const jsx = await AlertDetailPage({ params: Promise.resolve({ id: "nope" }) });
    render(jsx);
    expect(screen.getByText(/alert not found/i)).toBeInTheDocument();
  });

  it("shows dismiss and link-to-case actions, and a create-case link, for a new alert", async () => {
    (getAlert as jest.Mock).mockResolvedValue(makeAlert());
    (listCases as jest.Mock).mockResolvedValue({
      data: [{ id: "c1", title: "Existing case", status: "OPEN" }],
      total: 1,
      limit: 100,
      offset: 0,
    });
    const jsx = await AlertDetailPage({ params: Promise.resolve({ id: "a1" }) });
    render(jsx);
    expect(screen.getByRole("button", { name: /dismiss/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/link to an existing case/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /create case from this alert/i })).toHaveAttribute(
      "href",
      "/cases/new?alertIds=a1",
    );
  });

  it("hides dismiss and link-to-case actions once the alert is linked", async () => {
    (getAlert as jest.Mock).mockResolvedValue(makeAlert({ status: "linked" }));
    const jsx = await AlertDetailPage({ params: Promise.resolve({ id: "a1" }) });
    render(jsx);
    expect(screen.queryByRole("button", { name: /dismiss/i })).not.toBeInTheDocument();
    expect(screen.getByText(/linked to a case/i)).toBeInTheDocument();
  });

  it("shows the dismissal reason and resolved dismisser name once dismissed", async () => {
    (getAlert as jest.Mock).mockResolvedValue(
      makeAlert({
        status: "dismissed",
        dismissReason: "False positive",
        dismissedById: "u1",
        dismissedAt: "2026-08-20T01:00:00.000Z",
      }),
    );
    (listUsers as jest.Mock).mockResolvedValue([
      { id: "u1", name: "Ada Lovelace", role: "analyst", disabledAt: null },
    ]);
    const jsx = await AlertDetailPage({ params: Promise.resolve({ id: "a1" }) });
    render(jsx);
    expect(screen.getByText(/false positive/i)).toBeInTheDocument();
    expect(screen.getByText(/ada lovelace/i)).toBeInTheDocument();
  });

  it("excludes resolved cases from the link-to-case options", async () => {
    (getAlert as jest.Mock).mockResolvedValue(makeAlert());
    (listCases as jest.Mock).mockResolvedValue({
      data: [
        { id: "c1", title: "Open case", status: "OPEN" },
        { id: "c2", title: "Closed case", status: "RESOLVED" },
      ],
      total: 2,
      limit: 100,
      offset: 0,
    });
    const jsx = await AlertDetailPage({ params: Promise.resolve({ id: "a1" }) });
    render(jsx);
    expect(screen.getByText("Open case")).toBeInTheDocument();
    expect(screen.queryByText("Closed case")).not.toBeInTheDocument();
  });

  it("renders the raw payload when present", async () => {
    (getAlert as jest.Mock).mockResolvedValue(makeAlert({ rawPayload: { host: "wks-014" } }));
    const jsx = await AlertDetailPage({ params: Promise.resolve({ id: "a1" }) });
    render(jsx);
    expect(screen.getByText(/wks-014/)).toBeInTheDocument();
  });

  it("renders no raw-payload section when the alert has none", async () => {
    (getAlert as jest.Mock).mockResolvedValue(makeAlert({ rawPayload: null }));
    const jsx = await AlertDetailPage({ params: Promise.resolve({ id: "a1" }) });
    render(jsx);
    expect(screen.queryByText(/raw payload/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && npx jest "alerts/\[id\]/page.test.tsx"`
Expected: FAIL — `./page` doesn't exist yet.

- [ ] **Step 3: Implement the page**

Create `apps/web/app/(workspace)/alerts/[id]/page.tsx`:

```tsx
import Link from "next/link";
import { getAlert } from "@/features/alerts/service";
import { listCases } from "@/features/cases/service";
import { listUsers } from "@/features/users/service";
import { buildUserNameMap, resolveUserName } from "@/lib/format-user";
import { ApiError } from "@/lib/server/api-client";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Section } from "@/components/ui/section";
import { ALERT_STATUS_BADGE_TONE, SEVERITY_BADGE_TONE } from "@/lib/badge-tones";
import { DismissForm } from "./dismiss-form";
import { LinkToCaseForm } from "./link-to-case-form";

export default async function AlertDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let alert;
  try {
    alert = await getAlert(id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return <EmptyState title="Alert not found" description={`No alert matches id "${id}".`} />;
    }
    throw error;
  }

  const isNew = alert.status === "new";
  const isDismissed = alert.status === "dismissed";

  // Cases are fetched only when the alert can still be linked, and users
  // only to resolve who dismissed it -- neither call is needed for a
  // "linked" alert, and GET /alerts/:id cannot report which case a linked
  // alert belongs to (no controller path currently includes that relation;
  // out of scope for this milestone's approved backend change).
  const [users, casesPage] = await Promise.all([
    isDismissed ? listUsers() : Promise.resolve([]),
    isNew ? listCases({ limit: 100 }) : Promise.resolve({ data: [], total: 0, limit: 0, offset: 0 }),
  ]);
  const userNames = buildUserNameMap(users);
  const linkableCases = casesPage.data
    .filter((kase) => kase.status !== "RESOLVED")
    .map((kase) => ({ id: kase.id, title: kase.title }));

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">{alert.summary}</h1>
        <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-black/60 dark:text-white/60">Status</dt>
            <dd>
              <Badge tone={ALERT_STATUS_BADGE_TONE[alert.status]}>{alert.status}</Badge>
            </dd>
          </div>
          <div>
            <dt className="text-black/60 dark:text-white/60">Severity</dt>
            <dd>
              <Badge tone={SEVERITY_BADGE_TONE[alert.severity]}>{alert.severity}</Badge>
            </dd>
          </div>
          <div>
            <dt className="text-black/60 dark:text-white/60">Source</dt>
            <dd>{alert.source}</dd>
          </div>
          <div>
            <dt className="text-black/60 dark:text-white/60">Created</dt>
            <dd>{new Date(alert.createdAt).toLocaleString()}</dd>
          </div>
        </dl>
        {isDismissed && (
          <Card as="p" className="p-4">
            <span className="font-medium">
              Dismissed
              {alert.dismissedById ? ` by ${resolveUserName(userNames, alert.dismissedById)}` : ""}
              {alert.dismissedAt ? ` on ${new Date(alert.dismissedAt).toLocaleString()}` : ""}:{" "}
            </span>
            {alert.dismissReason}
          </Card>
        )}
        {alert.status === "linked" && (
          <p className="text-sm text-black/60 dark:text-white/60">
            This alert has been linked to a case.
          </p>
        )}
      </div>

      {alert.rawPayload && (
        <Section title="Raw payload">
          <Card as="pre" className="overflow-x-auto p-4 text-xs font-mono">
            {JSON.stringify(alert.rawPayload, null, 2)}
          </Card>
        </Section>
      )}

      {isNew && (
        <Section title="Actions">
          <div className="flex flex-wrap gap-4">
            <Link
              href={`/cases/new?alertIds=${encodeURIComponent(alert.id)}`}
              className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/80 dark:bg-white dark:text-black dark:hover:bg-white/80"
            >
              Create case from this alert
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <DismissForm alertId={alert.id} />
            <LinkToCaseForm alertId={alert.id} cases={linkableCases} />
          </div>
        </Section>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && npx jest "alerts/\[id\]/page.test.tsx"`
Expected: PASS (8/8).

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/(workspace)/alerts/[id]/page.tsx" "apps/web/app/(workspace)/alerts/[id]/page.test.tsx"
git commit -m "feat(web): add alert detail page"
```

## Task 7: Alerts list page

**Files:**
- Create: `apps/web/app/(workspace)/alerts/page.tsx`
- Create: `apps/web/app/(workspace)/alerts/page.test.tsx`

**Interfaces:**
- Consumes: `listAlerts` (Task 3), `EmptyState`, `Badge` (existing), `ALERT_STATUS_BADGE_TONE`/`SEVERITY_BADGE_TONE` (Task 2).
- Produces: the `/alerts` route, and its checkbox-driven `GET` form to `/cases/new` that Task 8's page consumes via `alertIds` search params.

- [ ] **Step 1: Write the failing test**

Create `apps/web/app/(workspace)/alerts/page.test.tsx`:

```tsx
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";

jest.mock("../../../features/alerts/service", () => ({
  listAlerts: jest.fn(),
}));

import { listAlerts } from "../../../features/alerts/service";
import AlertsPage from "./page";

function makeAlert(overrides: Record<string, unknown> = {}) {
  return {
    id: "a1",
    source: "manual",
    summary: "Suspicious login",
    severity: "high",
    status: "new",
    dismissReason: null,
    dismissedById: null,
    dismissedAt: null,
    rawPayload: null,
    createdAt: "2026-08-20T00:00:00.000Z",
    ...overrides,
  };
}

describe("AlertsPage", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("renders an alert row with its summary, status, severity, and source", async () => {
    (listAlerts as jest.Mock).mockResolvedValue({ data: [makeAlert()], total: 1, limit: 25, offset: 0 });

    const jsx = await AlertsPage({ searchParams: Promise.resolve({}) });
    render(jsx);

    expect(screen.getByText("Suspicious login")).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "new" })).toBeInTheDocument();
    expect(screen.getByText("manual")).toBeInTheDocument();
  });

  it("renders an empty state when there are no alerts", async () => {
    (listAlerts as jest.Mock).mockResolvedValue({ data: [], total: 0, limit: 25, offset: 0 });
    const jsx = await AlertsPage({ searchParams: Promise.resolve({}) });
    render(jsx);
    expect(screen.getByText(/no alerts/i)).toBeInTheDocument();
  });

  it("renders a selection checkbox only for a 'new' alert, not a linked or dismissed one", async () => {
    (listAlerts as jest.Mock).mockResolvedValue({
      data: [
        makeAlert({ id: "a1", status: "new" }),
        makeAlert({ id: "a2", status: "dismissed", summary: "Old alert" }),
      ],
      total: 2,
      limit: 25,
      offset: 0,
    });
    const jsx = await AlertsPage({ searchParams: Promise.resolve({}) });
    render(jsx);
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
  });

  it("wraps the table in a form that submits selected alertIds to /cases/new", async () => {
    (listAlerts as jest.Mock).mockResolvedValue({ data: [makeAlert()], total: 1, limit: 25, offset: 0 });
    const { container } = render(await AlertsPage({ searchParams: Promise.resolve({}) }));
    const form = container.querySelector('form[action="/cases/new"]');
    expect(form).not.toBeNull();
    expect(form?.querySelector('input[type="checkbox"][name="alertIds"]')).not.toBeNull();
  });

  it("passes status/severity query params through to listAlerts", async () => {
    (listAlerts as jest.Mock).mockResolvedValue({ data: [], total: 0, limit: 25, offset: 0 });
    await AlertsPage({ searchParams: Promise.resolve({ status: "new", severity: "high" }) });
    expect(listAlerts).toHaveBeenCalledWith({ status: "new", severity: "high", limit: 25, offset: 0 });
  });

  it("shows a Next link when more alerts exist beyond the current page", async () => {
    (listAlerts as jest.Mock).mockResolvedValue({ data: [makeAlert()], total: 30, limit: 25, offset: 0 });
    const jsx = await AlertsPage({ searchParams: Promise.resolve({}) });
    render(jsx);
    expect(screen.getByRole("link", { name: "Next" })).toBeInTheDocument();
  });

  it("falls back to offset 0 for a malformed offset value instead of throwing", async () => {
    (listAlerts as jest.Mock).mockResolvedValue({ data: [], total: 0, limit: 25, offset: 0 });
    await AlertsPage({ searchParams: Promise.resolve({ offset: "not-a-number" }) });
    expect(listAlerts).toHaveBeenCalledWith(expect.objectContaining({ offset: 0 }));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && npx jest "alerts/page.test.tsx"`
Expected: FAIL — `./page` doesn't exist yet.

- [ ] **Step 3: Implement the page**

Create `apps/web/app/(workspace)/alerts/page.tsx`:

```tsx
import Link from "next/link";
import { listAlerts } from "@/features/alerts/service";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { ALERT_STATUS_BADGE_TONE, SEVERITY_BADGE_TONE } from "@/lib/badge-tones";
import type { AlertStatus, Severity } from "@/lib/api/types";

const STATUSES: AlertStatus[] = ["new", "linked", "dismissed"];
const SEVERITIES: Severity[] = ["low", "medium", "high", "critical"];

// Same rationale as app/(workspace)/cases/page.tsx's identical helper:
// Next.js 16's searchParams type allows a repeated query param to arrive as
// a string[]; every filter here is single-valued, so only the first value
// is used.
function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function buildPageHref(
  filters: { status?: AlertStatus; severity?: Severity },
  offset: number,
): string {
  const params = new URLSearchParams();
  if (filters.status !== undefined) params.set("status", filters.status);
  if (filters.severity !== undefined) params.set("severity", filters.severity);
  params.set("offset", String(offset));
  return `/alerts?${params.toString()}`;
}

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;

  const status = firstValue(params.status);
  const severity = firstValue(params.severity);
  const offset = firstValue(params.offset);

  const parsedOffset = offset !== undefined ? Number(offset) : 0;
  const safeOffset = Number.isInteger(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0;

  const filters = {
    status: STATUSES.includes(status as AlertStatus) ? (status as AlertStatus) : undefined,
    severity: SEVERITIES.includes(severity as Severity) ? (severity as Severity) : undefined,
    limit: 25,
    offset: safeOffset,
  };

  const { data: alerts, total } = await listAlerts(filters);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Alerts</h1>

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
        <button type="submit" className="rounded-md border border-black/20 px-4 py-2 text-sm dark:border-white/20">
          Apply filters
        </button>
      </form>

      {alerts.length === 0 ? (
        <EmptyState title="No alerts match these filters" />
      ) : (
        // A plain GET form, not a Server Action: selecting alerts here is
        // navigation to the case-creation form, not a mutation -- the same
        // reasoning that already makes the filter form above a GET form.
        // Selection does not persist across pagination; that's an accepted
        // limitation, not a bug, given the current page size.
        <form method="GET" action="/cases/new">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-black/10 dark:border-white/10">
                <th className="py-2 font-medium" />
                <th className="py-2 font-medium">Summary</th>
                <th className="py-2 font-medium">Status</th>
                <th className="py-2 font-medium">Severity</th>
                <th className="py-2 font-medium">Source</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((alert) => (
                <tr key={alert.id} className="border-b border-black/5 dark:border-white/5">
                  <td className="py-2">
                    {alert.status === "new" && (
                      <input
                        type="checkbox"
                        name="alertIds"
                        value={alert.id}
                        aria-label={`Select ${alert.summary}`}
                      />
                    )}
                  </td>
                  <td className="py-2">
                    <Link href={`/alerts/${alert.id}`} className="underline">
                      {alert.summary}
                    </Link>
                  </td>
                  <td className="py-2">
                    <Badge tone={ALERT_STATUS_BADGE_TONE[alert.status]}>{alert.status}</Badge>
                  </td>
                  <td className="py-2">
                    <Badge tone={SEVERITY_BADGE_TONE[alert.severity]}>{alert.severity}</Badge>
                  </td>
                  <td className="py-2">{alert.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="pt-4">
            <button
              type="submit"
              className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/80 dark:bg-white dark:text-black dark:hover:bg-white/80"
            >
              Create case from selected
            </button>
          </div>
        </form>
      )}

      <p className="text-sm text-black/60 dark:text-white/60">
        Showing {alerts.length} of {total} alert{total === 1 ? "" : "s"}.
      </p>

      <div className="flex items-center gap-4">
        {filters.offset > 0 && (
          <Link href={buildPageHref(filters, Math.max(0, filters.offset - filters.limit))} className="text-sm underline">
            Previous
          </Link>
        )}
        {filters.offset + alerts.length < total && (
          <Link href={buildPageHref(filters, filters.offset + filters.limit)} className="text-sm underline">
            Next
          </Link>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && npx jest "alerts/page.test.tsx"`
Expected: PASS (7/7).

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/(workspace)/alerts/page.tsx" "apps/web/app/(workspace)/alerts/page.test.tsx"
git commit -m "feat(web): add alerts list page with filters and create-case-from-selected"
```

## Task 8: Extend case creation to accept alerts

**Files:**
- Modify: `apps/web/app/(workspace)/cases/new/case-form.tsx`
- Modify: `apps/web/app/(workspace)/cases/new/case-form.test.tsx`
- Modify: `apps/web/app/(workspace)/cases/new/actions.ts`
- Modify: `apps/web/app/(workspace)/cases/new/page.tsx`
- Create: `apps/web/app/(workspace)/cases/new/page.test.tsx`

**Interfaces:**
- Consumes: `getAlert` (Task 3), `createCase` with `alertIds` (Task 3), `Card`/`Badge` (existing), `SEVERITY_BADGE_TONE` (existing).
- Produces: `/cases/new?alertIds=<uuid>&alertIds=<uuid>...` now previews the selected alerts and creates the case with them linked. No change to `/cases/new`'s behavior when no `alertIds` are present.

- [ ] **Step 1: Write the failing test for `case-form.tsx`**

Add to `apps/web/app/(workspace)/cases/new/case-form.test.tsx` (after the existing `"always renders a title field and a severity select"` test):

```tsx
  it("renders a hidden field for each given alertId, and none when omitted", () => {
    const { container, rerender } = render(
      <CaseForm role="analyst" activeUsers={[]} alertIds={["a1", "a2"]} />,
    );
    const hiddenInputs = container.querySelectorAll('input[type="hidden"][name="alertIds"]');
    expect(hiddenInputs).toHaveLength(2);
    expect([...hiddenInputs].map((el) => (el as HTMLInputElement).value)).toEqual(["a1", "a2"]);

    rerender(<CaseForm role="analyst" activeUsers={[]} />);
    expect(container.querySelectorAll('input[type="hidden"][name="alertIds"]')).toHaveLength(0);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && npx jest case-form.test.tsx`
Expected: FAIL — `CaseForm` doesn't accept an `alertIds` prop yet.

- [ ] **Step 3: Implement the `case-form.tsx` change**

In `apps/web/app/(workspace)/cases/new/case-form.tsx`, change the component signature and opening form body from:

```tsx
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
```

to:

```tsx
export function CaseForm({
  role,
  activeUsers,
  alertIds = [],
}: {
  role: UserRole;
  activeUsers: { id: string; name: string }[];
  alertIds?: string[];
}) {
  const [state, formAction, pending] = useActionState(createCaseAction, initialState);

  return (
    <form action={formAction} className="max-w-md space-y-4">
      {alertIds.map((id) => (
        <input key={id} type="hidden" name="alertIds" value={id} />
      ))}
      <TextField label="Title" name="title" required maxLength={200} />
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && npx jest case-form.test.tsx`
Expected: PASS, including all pre-existing tests (the new prop is optional and defaults to `[]`, so every existing call site and test is unaffected).

- [ ] **Step 5: Write the failing test for `cases/new/page.tsx`**

Create `apps/web/app/(workspace)/cases/new/page.test.tsx`:

```tsx
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";

jest.mock("../../../../features/auth/dal", () => ({ verifySession: jest.fn() }));
jest.mock("../../../../features/users/service", () => ({ listUsers: jest.fn() }));
jest.mock("../../../../features/alerts/service", () => ({ getAlert: jest.fn() }));

import { verifySession } from "../../../../features/auth/dal";
import { listUsers } from "../../../../features/users/service";
import { getAlert } from "../../../../features/alerts/service";
import NewCasePage from "./page";

describe("NewCasePage", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (verifySession as jest.Mock).mockResolvedValue({ id: "u1", name: "Ada Lovelace", role: "analyst" });
    (listUsers as jest.Mock).mockResolvedValue([]);
  });

  it("renders the form with no alert preview when no alertIds are given", async () => {
    const jsx = await NewCasePage({ searchParams: Promise.resolve({}) });
    render(jsx);
    expect(screen.queryByText(/linked alert/i)).not.toBeInTheDocument();
    expect(getAlert).not.toHaveBeenCalled();
  });

  it("previews the selected alerts and passes their resolved ids through to the form", async () => {
    (getAlert as jest.Mock).mockResolvedValue({
      id: "a1",
      source: "manual",
      summary: "Suspicious login",
      severity: "high",
      status: "new",
      dismissReason: null,
      dismissedById: null,
      dismissedAt: null,
      rawPayload: null,
      createdAt: "2026-08-20T00:00:00.000Z",
    });

    const { container } = render(
      await NewCasePage({
        searchParams: Promise.resolve({ alertIds: "3fa85f64-5717-4562-b3fc-2c963f66afa6" }),
      }),
    );

    expect(screen.getByText("Suspicious login")).toBeInTheDocument();
    expect(container.querySelector('input[type="hidden"][name="alertIds"]')).toHaveValue("a1");
  });

  it("drops a malformed alertId instead of throwing or fetching it", async () => {
    const jsx = await NewCasePage({ searchParams: Promise.resolve({ alertIds: "not-a-uuid" }) });
    render(jsx);
    expect(getAlert).not.toHaveBeenCalled();
    expect(screen.queryByText(/linked alert/i)).not.toBeInTheDocument();
  });

  it("silently drops an alert id that no longer resolves", async () => {
    (getAlert as jest.Mock).mockRejectedValue(new Error("not found"));
    const jsx = await NewCasePage({
      searchParams: Promise.resolve({ alertIds: "3fa85f64-5717-4562-b3fc-2c963f66afa6" }),
    });
    render(jsx);
    expect(screen.queryByText(/linked alert/i)).not.toBeInTheDocument();
  });

  it("accepts multiple alertIds from a repeated query param", async () => {
    (getAlert as jest.Mock).mockImplementation((id: string) =>
      Promise.resolve({
        id,
        source: "manual",
        summary: `Alert ${id}`,
        severity: "medium",
        status: "new",
        dismissReason: null,
        dismissedById: null,
        dismissedAt: null,
        rawPayload: null,
        createdAt: "2026-08-20T00:00:00.000Z",
      }),
    );

    render(
      await NewCasePage({
        searchParams: Promise.resolve({
          alertIds: [
            "3fa85f64-5717-4562-b3fc-2c963f66afa6",
            "3fa85f64-5717-4562-b3fc-2c963f66afa7",
          ],
        }),
      }),
    );

    expect(screen.getByText(/2 linked alerts/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `cd apps/web && npx jest "cases/new/page.test.tsx"`
Expected: FAIL — `NewCasePage` doesn't read `searchParams` or fetch alerts yet.

- [ ] **Step 7: Implement the `actions.ts` change**

In `apps/web/app/(workspace)/cases/new/actions.ts`, change `createCaseAction` from:

```ts
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

  let created;
  try {
    created = await createCase({
      title,
      severity,
      assigneeId: typeof assigneeId === "string" && assigneeId ? assigneeId : undefined,
    });
  } catch (error) {
```

to:

```ts
export async function createCaseAction(
  _prevState: CaseFormState,
  formData: FormData,
): Promise<CaseFormState> {
  const title = String(formData.get("title") ?? "").trim();
  const severity = String(formData.get("severity") ?? "") as Severity;
  const assigneeId = formData.get("assigneeId");
  const alertIds = formData.getAll("alertIds").map((value) => String(value));

  if (!title) {
    return { error: "Title is required." };
  }
  if (!["low", "medium", "high", "critical"].includes(severity)) {
    return { error: "Severity is required." };
  }

  let created;
  try {
    created = await createCase({
      title,
      severity,
      assigneeId: typeof assigneeId === "string" && assigneeId ? assigneeId : undefined,
      alertIds: alertIds.length > 0 ? alertIds : undefined,
    });
  } catch (error) {
```

- [ ] **Step 8: Implement the `page.tsx` change**

Replace the full contents of `apps/web/app/(workspace)/cases/new/page.tsx` (currently):

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

with:

```tsx
import { verifySession } from "@/features/auth/dal";
import { listUsers } from "@/features/users/service";
import { getAlert } from "@/features/alerts/service";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SEVERITY_BADGE_TONE } from "@/lib/badge-tones";
import { CaseForm } from "./case-form";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Mirrors app/(workspace)/cases/page.tsx's firstValue helper, generalized to
// keep every value instead of just the first: unlike status/severity, this
// param is genuinely multi-valued (one alert or several, arriving from the
// alerts list's checkbox selection or a single alert-detail link).
function toAlertIds(value: string | string[] | undefined): string[] {
  const values = Array.isArray(value) ? value : value !== undefined ? [value] : [];
  return [...new Set(values.filter((candidate) => UUID_RE.test(candidate)))];
}

export default async function NewCasePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const user = await verifySession();
  const users = user.role === "lead" ? await listUsers() : [];
  const activeUsers = users.filter((candidate) => !candidate.disabledAt);

  const requestedAlertIds = toAlertIds(params.alertIds);
  // A stale, since-linked/dismissed, or otherwise unresolvable id is
  // silently dropped rather than surfaced as an error here -- the worst
  // case is the case gets created with fewer linked alerts than intended,
  // never with a broken reference. If a selected alert's status has since
  // changed, createCaseAction's own error handling (unchanged by this
  // milestone) still applies when the case is actually submitted.
  const alertResults = await Promise.all(
    requestedAlertIds.map((id) => getAlert(id).catch(() => null)),
  );
  const alerts = alertResults.filter((alert): alert is NonNullable<typeof alert> => alert !== null);
  const alertIds = alerts.map((alert) => alert.id);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">New case</h1>
      {alerts.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-black/60 dark:text-white/60">
            This case will be created with {alerts.length} linked alert{alerts.length === 1 ? "" : "s"}:
          </p>
          <ul className="space-y-2">
            {alerts.map((alert) => (
              <Card key={alert.id} as="li" className="p-3 text-sm">
                <span className="font-medium">{alert.summary}</span>{" "}
                <Badge tone={SEVERITY_BADGE_TONE[alert.severity]}>{alert.severity}</Badge>
              </Card>
            ))}
          </ul>
        </div>
      )}
      <CaseForm role={user.role} activeUsers={activeUsers} alertIds={alertIds} />
    </div>
  );
}
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `cd apps/web && npx jest "cases/new/page.test.tsx" case-form.test.tsx`
Expected: PASS (5/5 for the new page test, all passing for `case-form.test.tsx` including the new one).

- [ ] **Step 10: Commit**

```bash
git add "apps/web/app/(workspace)/cases/new/case-form.tsx" "apps/web/app/(workspace)/cases/new/case-form.test.tsx" "apps/web/app/(workspace)/cases/new/actions.ts" "apps/web/app/(workspace)/cases/new/page.tsx" "apps/web/app/(workspace)/cases/new/page.test.tsx"
git commit -m "feat(web): create a case from one or more selected alerts"
```

## Task 9: Full-suite verification and PROGRESS.md update

**Files:**
- Modify: `docs/PROGRESS.md`

**Interfaces:**
- Consumes: nothing (documentation only).
- Produces: nothing consumed by later tasks — this is the final task.

- [ ] **Step 1: Run the full backend verification bar**

Run, from `apps/api/`:
```bash
npx jest && npx tsc --noEmit && npm run lint && npx prisma validate && npx prisma migrate status
```
Expected: unit tests 127/127 (per Task 1), `tsc`/lint clean, Prisma validate/migrate-status clean (this milestone makes zero schema changes).

Run, from `apps/api/`:
```bash
npm run test:e2e
```
Expected: 98/98 passing, unchanged (this milestone's one backend change doesn't alter any existing route's request/response contract).

- [ ] **Step 2: Run the full frontend verification bar**

Run, from `apps/web/`:
```bash
npx jest && npx tsc --noEmit && npm run lint && npm run build
```
Expected: all tests passing (105 existing + roughly 45 new across Tasks 2-8 — record the exact final count when run), `tsc`/lint clean, `next build` clean, emitting `/alerts` and `/alerts/[id]` alongside every existing route.

- [ ] **Step 3: Live walkthrough against the real API and a real dev server**

Follow the exact same throwaway-fixture-and-cleanup discipline already established for this repository's prior milestones (see docs/PROGRESS.md's "Cases Workspace (Milestone 2)" and "UI design-system hardening pass" sections for the precedent): start `apps/api`'s dev server against the dedicated `kestro-postgres-dev` container, start `apps/web`'s dev server, seed a throwaway Analyst, Lead, and several alerts spanning all three statuses and multiple severities (direct SQL insert, matching the precedent set in this same conversation's UI hardening pass, since `POST /alerts` plus manual case-fixture creation would work equally well and is simpler to script — either is acceptable), then drive the real flow:
- As the Analyst: view `/alerts`, filter by status/severity, open a `new` alert's detail page, dismiss one alert with a reason, link a second alert to an existing case, select two more `new` alerts on the list page and submit "Create case from selected", confirm the resulting `/cases/new` page previews both alerts and that submitting creates a case with both linked (visible in that case's "Linked alerts" section).
- Confirm a `linked` alert's detail page shows no dismiss/link controls and the "linked to a case" message.
- Confirm a `dismissed` alert's detail page shows the reason and dismisser name, no action controls.
- Confirm the Lead sees the same shared alert queue (no visibility scoping regression).
- Delete all throwaway rows afterward and confirm the dev DB is back to empty; stop both dev servers.

- [ ] **Step 4: Update docs/PROGRESS.md**

Add a new subsection under "## Phase 2 — Operations Workspace", after the existing "UI design-system hardening pass (post–Milestone 2)" subsection, following that section's own style (what was built, the one backend change, verification results including the live walkthrough), and update the module status table's `Web (Next.js app shell)` row and the "Current task" / "Next planned milestone" sections to reflect that the Alert Triage Workspace is now complete. Add a `Chronological change history` row for this milestone's commit(s).

- [ ] **Step 5: Commit**

```bash
git add docs/PROGRESS.md
git commit -m "docs: record Alert Triage Workspace completion"
```

## Self-Review

**Spec coverage**: every approved decision maps to a task — list+filters+pagination (Task 7), detail+raw payload (Task 6), dismiss-with-reason (Tasks 5-6), link-to-existing-case (Tasks 5-6), create-case-from-one-or-many-alerts (Tasks 7-8), reuse of existing primitives/patterns throughout (no new primitive is created anywhere in this plan), the one approved backend hardening change (Task 1), and the explicit exclusions (no search/correlation/ownership/dashboard/investigation/bulk-dismiss/bulk-link/AI anywhere in this plan).

**Placeholder scan**: no task contains "TBD", "similar to Task N" without the actual code, or an unshown test — every step above includes the literal code or command.

**Type consistency**: `AlertActionState` (Task 5) is used identically in `dismiss-form.tsx`/`link-to-case-form.tsx`/`page.tsx`; `ListAlertsFilters` (Task 3) matches the parameter shape `alerts/page.tsx` (Task 7) builds; `CreateCaseInput.alertIds` (Task 3) matches what `cases/new/actions.ts` (Task 8) passes; `Card`'s `as` prop and `Badge`'s `tone` prop are used exactly as their existing (unmodified) definitions require throughout Tasks 6-8.
