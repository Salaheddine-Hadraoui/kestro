# Investigation Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Hypotheses" section and an "Evidence" section to the existing case detail page, letting an Analyst/Lead propose/validate/reject hypotheses, record evidence, and link evidence to a hypothesis — the smallest coherent slice of docs/PRODUCT.md's Investigation chain not yet exposed in the UI, using only endpoints that already exist.

**Architecture:** Pure extension of the existing Server-Component + Server-Action + typed-service-layer pattern established by the Cases and Alert Triage Workspaces. No new route, no new nav item — Hypotheses and Evidence have no independent existence outside a Case (no global list endpoint for either), so unlike Alerts they get new *sections on the case detail page*, not a new top-level workspace. Zero backend changes.

**Tech Stack:** Next.js 16 (App Router, Server Components, Server Actions), TypeScript, Tailwind CSS, Jest + React Testing Library.

**Spec:** This plan implements the "smallest coherent Investigation Workspace milestone" architectural discovery performed earlier in this conversation (two full discovery passes, both read-only, both citing exact file:line backend/schema/doc evidence), resumed and re-verified against the repository in a follow-up session after an interruption. There is no separate spec document; the discovery's verified facts and this plan's own Discovery Notes below are the record. Three small UI-design choices from that discovery — page density, whether Evidence's `type` field renders as a plain label, and the button styling for rejecting a hypothesis — were explicitly put to the project owner in the resumed session; all three are now confirmed (see Global Constraints) and are no longer open.

## Global Constraints

- No backend, schema, or migration changes of any kind — every endpoint this milestone needs already exists, is tested, and is correctly authorized (verified below).
- No new top-level route or nav item — everything is new sections on the existing `/cases/[id]` page.
- Reuse the existing design system only: `Badge`, `Card`, `Section`, `Button`, `EmptyState`, `FormError`, `TextField`. No new UI primitive.
- Preserve the existing Server Component + Server Action + typed-service-layer architecture exactly as Cases/Alerts already established it.
- Backend authorization stays the sole source of truth — the frontend never invents a role/visibility rule the backend doesn't enforce. Investigations/Evidence have **zero role differentiation** beyond Cases' own assignee-or-Lead rule (no Lead-only action exists here, unlike Cases' lifecycle) — the UI must not imply one.
- Do NOT implement: AI, binary/file evidence upload, hypothesis reopening, evidence↔hypothesis unlink, evidence edit/delete, a general/full Timeline UI, Dashboard/metrics work. All are either explicitly deferred by docs/ROADMAP.md or deliberately absent per docs/PROGRESS.md's own technical-debt log — not gaps to close here.
- **Page-density decision (confirmed by the project owner)**: Hypotheses and Evidence render as always-visible `Section`s, exactly matching the existing Notes & Comments precedent — no tabs/collapsing, since no such pattern exists anywhere in this app and introducing one would be a new UI paradigm this milestone isn't scoped to add.
- **Evidence-type-rendering decision (confirmed by the project owner)**: `EvidenceType` (`LOG|SCREENSHOT|FILE|URL|COMMAND_OUTPUT|OTHER`) renders as a plain text label next to the source, not a `Badge` — it's a flat category tag, not a severity/status progression, and rendering it identically to other free-text metadata (like Alerts' `source`) avoids implying upload capability that doesn't exist for `FILE`/`SCREENSHOT`.
- **Reject-hypothesis button variant (confirmed by the project owner)**: uses the `secondary` variant, not `warning`. The plan originally drafted `warning` (`bg-amber-600`) for symmetry with other destructive-looking actions, but `Button`'s own code comment reserves `warning` for actions that raise a case's urgency or override normal flow (escalate, reopen) and explicitly excludes routine forward transitions — rejecting a hypothesis is a normal, expected investigative outcome (see the `HYPOTHESIS_STATUS_BADGE_TONE` comment in Task 1, which makes the identical argument for why `rejected` gets a non-alarming badge tone), so `secondary` is the semantically correct choice.
- Hypothesis/Evidence action gating on `RESOLVED` cases must mirror Notes & Comments' existing pattern exactly (forms hidden client-side, backed by the same 409 server-side that already exists).

## Discovery Notes (verified against the current repository)

- **Every needed endpoint already exists** (`apps/api/src/investigations/investigations.controller.ts`, `apps/api/src/evidence/evidence.controller.ts`): `POST/GET /cases/:id/hypotheses`, `POST .../validate {conclusionStatement}`, `POST .../reject` (no body), `POST .../evidence {evidenceId}` (links), `POST/GET /cases/:id/evidence`. All under `JwtAuthGuard` only — no `@Roles` anywhere in either module; authorization is 100% inherited from `CasesService.findOne` (Analyst-must-be-assignee-or-Lead) plus a 409 on any write against a `RESOLVED` case.
- **No separate `Investigation` entity** — `Hypothesis` attaches directly to `Case` via `caseId` (`apps/api/prisma/schema.prisma:188-207`), matching `Evidence`'s own direct attachment. `HypothesisStatus = proposed|validated|rejected`, one-directional and terminal (no reopening). `EvidenceType = LOG|SCREENSHOT|FILE|URL|COMMAND_OUTPUT|OTHER` on a **text-only** `content` field (max 10,000 chars) — no binary storage exists regardless of type value.
- **`GET .../hypotheses` and `GET .../evidence` return plain arrays** (`Hypothesis[]`/`Evidence[]`), not the `{data,total,limit,offset}` envelope Cases/Alerts/Timeline use. This plan's service layer types both as `Promise<Hypothesis[]>`/`Promise<Evidence[]>` accordingly — do not wrap them in a paginated shape that doesn't exist.
- **No dedicated endpoint for "evidence linked to hypothesis X" is needed by the frontend** even though one exists (`GET .../hypotheses/:hid/evidence`) — since this milestone already fetches the case's full evidence list (to render the Evidence section and build the link-picker's "currently unlinked" options), "which evidence is linked to hypothesis X" and "which evidence is still unlinked" are both cheap client-side derivations from that one list (`evidence.filter(e => e.hypothesisId === hypothesis.id)` / `evidence.filter(e => e.hypothesisId === null)`). This avoids N+1 requests and keeps the service layer to exactly 5 Investigations functions instead of 6.
- **No frontend Investigation/Evidence/Hypothesis code exists today** — confirmed by direct grep of `apps/web/` this session; only incidental word matches (the `start_investigation` case-transition label, the `evidence_added` timeline enum value already in shared types, forward-looking comments in `badge.tsx`/`section.tsx` anticipating exactly this reuse).
- **Current case detail page** (`apps/web/app/(workspace)/cases/[id]/page.tsx`) has, in order: header (title/status/severity/assignee/created/resolution), "Linked alerts", "Actions" (lifecycle transitions + Lead-only reassignment), "Notes & Comments". This plan inserts "Hypotheses" and "Evidence" between "Actions" and "Notes & Comments".
- **`cases/[id]/actions.ts` already holds every Server Action this page uses** (`transitionCaseAction`, `reassignCaseAction`, `addNoteAction`, `addCommentAction`) — this plan extends that same file rather than creating a new one, matching the established one-actions-file-per-page-directory convention (mirrored exactly by `alerts/[id]/actions.ts`).
- **Next.js 16 conventions**, confirmed directly against `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md:40-49,69-79`: this page already uses `params: Promise<{ id: string }>` — unchanged by this plan, since no new route/dynamic segment is added.

## Task 1: Types and badge tone for Hypothesis/Evidence

**Files:**
- Modify: `apps/web/lib/api/types.ts`
- Modify: `apps/web/lib/badge-tones.ts`
- Modify: `apps/web/lib/badge-tones.test.ts`

**Interfaces:**
- Produces: `HypothesisStatus`, `Hypothesis`, `EvidenceType`, `Evidence` types; `HYPOTHESIS_STATUS_BADGE_TONE: Record<HypothesisStatus, BadgeTone>`. Consumed by every later task.

- [ ] **Step 1: Add the new types**

In `apps/web/lib/api/types.ts`, add after the existing `PaginatedAlerts` interface (and before `TimelineEventType`):

```ts
export type HypothesisStatus = "proposed" | "validated" | "rejected";

export interface Hypothesis {
  id: string;
  caseId: string;
  authorId: string;
  statement: string;
  status: HypothesisStatus;
  conclusionStatement: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export type EvidenceType = "LOG" | "SCREENSHOT" | "FILE" | "URL" | "COMMAND_OUTPUT" | "OTHER";

export interface Evidence {
  id: string;
  caseId: string;
  timelineEventId: string;
  hypothesisId: string | null;
  type: EvidenceType;
  source: string;
  content: string;
  timestamp: string;
  authorId: string;
  createdAt: string;
}
```

- [ ] **Step 2: Write the failing test for the new badge tone**

In `apps/web/lib/badge-tones.test.ts`, change the import block from:

```ts
import {
  ALERT_STATUS_BADGE_TONE,
  CASE_STATUS_BADGE_TONE,
  SEVERITY_BADGE_TONE,
} from "./badge-tones";
import type { AlertStatus, CaseStatus, Severity } from "./api/types";
```

to:

```ts
import {
  ALERT_STATUS_BADGE_TONE,
  CASE_STATUS_BADGE_TONE,
  HYPOTHESIS_STATUS_BADGE_TONE,
  SEVERITY_BADGE_TONE,
} from "./badge-tones";
import type { AlertStatus, CaseStatus, HypothesisStatus, Severity } from "./api/types";
```

Add, after the existing `"maps every AlertStatus value to a tone"` test:

```ts
  it("maps every HypothesisStatus value to a tone", () => {
    const statuses: HypothesisStatus[] = ["proposed", "validated", "rejected"];
    for (const status of statuses) {
      expect(HYPOTHESIS_STATUS_BADGE_TONE[status]).toBeDefined();
    }
  });
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd apps/web && npx jest badge-tones.test.ts`
Expected: FAIL — `HYPOTHESIS_STATUS_BADGE_TONE` doesn't exist yet.

- [ ] **Step 4: Add the tone map**

In `apps/web/lib/badge-tones.ts`, change the type import from:

```ts
import type { AlertStatus, CaseStatus, Severity } from "./api/types";
```

to:

```ts
import type { AlertStatus, CaseStatus, HypothesisStatus, Severity } from "./api/types";
```

Add, after the existing `ALERT_STATUS_BADGE_TONE` export:

```ts
// proposed = unactioned (matches CaseStatus.OPEN/AlertStatus.new's neutral
// treatment); validated = a positive, confirmed outcome (matches
// CaseStatus.RESOLVED's green); rejected = closed without confirmation --
// distinct from validated, but deliberately not "red": ruling a hypothesis
// out is a normal, expected investigative outcome, not an alarm (mirrors
// AlertStatus.dismissed's same non-alarming purple, for the same reason).
export const HYPOTHESIS_STATUS_BADGE_TONE: Record<HypothesisStatus, BadgeTone> = {
  proposed: "neutral",
  validated: "green",
  rejected: "purple",
};
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd apps/web && npx jest badge-tones.test.ts`
Expected: PASS.

- [ ] **Step 6: Run `tsc --noEmit` to confirm the new types compile cleanly**

Run: `cd apps/web && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/api/types.ts apps/web/lib/badge-tones.ts apps/web/lib/badge-tones.test.ts
git commit -m "feat(web): add Hypothesis/Evidence types and hypothesis-status badge tone"
```

## Task 2: Service layers — Investigations and Evidence

**Files:**
- Create: `apps/web/features/investigations/service.ts`
- Create: `apps/web/features/investigations/service.test.ts`
- Create: `apps/web/features/evidence/service.ts`
- Create: `apps/web/features/evidence/service.test.ts`

**Interfaces:**
- Consumes: `apiFetch<T>` (`lib/server/api-client.ts`, unchanged); `Hypothesis`, `Evidence`, `EvidenceType` (Task 1).
- Produces: `listHypotheses(caseId): Promise<Hypothesis[]>`, `proposeHypothesis(caseId, statement): Promise<Hypothesis>`, `validateHypothesis(caseId, hypothesisId, conclusionStatement): Promise<Hypothesis>`, `rejectHypothesis(caseId, hypothesisId): Promise<Hypothesis>`, `linkEvidenceToHypothesis(caseId, hypothesisId, evidenceId): Promise<Evidence>` (`features/investigations/service.ts`); `listEvidence(caseId): Promise<Evidence[]>`, `AddEvidenceInput { type, source, content, timestamp }`, `addEvidence(caseId, input): Promise<Evidence>` (`features/evidence/service.ts`). Tasks 3-5 call these directly.

- [ ] **Step 1: Write the failing tests for `features/investigations/service.ts`**

Create `apps/web/features/investigations/service.test.ts`:

```ts
/** @jest-environment node */
jest.mock("../../lib/server/api-client", () => {
  const actual = jest.requireActual("../../lib/server/api-client");
  return { ...actual, apiFetch: jest.fn() };
});

import { apiFetch } from "../../lib/server/api-client";
import {
  linkEvidenceToHypothesis,
  listHypotheses,
  proposeHypothesis,
  rejectHypothesis,
  validateHypothesis,
} from "./service";

describe("investigations service", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("listHypotheses calls GET /cases/:id/hypotheses", async () => {
    (apiFetch as jest.Mock).mockResolvedValue([]);
    await listHypotheses("c1");
    expect(apiFetch).toHaveBeenCalledWith("/cases/c1/hypotheses");
  });

  it("proposeHypothesis posts the statement", async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ id: "h1" });
    await proposeHypothesis("c1", "Phishing led to credential theft");
    expect(apiFetch).toHaveBeenCalledWith("/cases/c1/hypotheses", {
      method: "POST",
      body: JSON.stringify({ statement: "Phishing led to credential theft" }),
    });
  });

  it("validateHypothesis posts the conclusionStatement to .../validate", async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ id: "h1" });
    await validateHypothesis("c1", "h1", "Confirmed via mail logs");
    expect(apiFetch).toHaveBeenCalledWith("/cases/c1/hypotheses/h1/validate", {
      method: "POST",
      body: JSON.stringify({ conclusionStatement: "Confirmed via mail logs" }),
    });
  });

  it("rejectHypothesis posts to .../reject with no body", async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ id: "h1" });
    await rejectHypothesis("c1", "h1");
    expect(apiFetch).toHaveBeenCalledWith("/cases/c1/hypotheses/h1/reject", { method: "POST" });
  });

  it("linkEvidenceToHypothesis posts the evidenceId to .../evidence", async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ id: "e1" });
    await linkEvidenceToHypothesis("c1", "h1", "e1");
    expect(apiFetch).toHaveBeenCalledWith("/cases/c1/hypotheses/h1/evidence", {
      method: "POST",
      body: JSON.stringify({ evidenceId: "e1" }),
    });
  });

  it("encodes ids when building request paths", async () => {
    (apiFetch as jest.Mock).mockResolvedValue([]);
    await listHypotheses("has space/slash");
    expect(apiFetch).toHaveBeenCalledWith("/cases/has%20space%2Fslash/hypotheses");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && npx jest features/investigations/service.test.ts`
Expected: FAIL — `./service` doesn't exist yet.

- [ ] **Step 3: Implement `features/investigations/service.ts`**

Create `apps/web/features/investigations/service.ts`:

```ts
import "server-only";
import { apiFetch } from "../../lib/server/api-client";
import type { Evidence, Hypothesis } from "../../lib/api/types";

export async function listHypotheses(caseId: string): Promise<Hypothesis[]> {
  return apiFetch<Hypothesis[]>(`/cases/${encodeURIComponent(caseId)}/hypotheses`);
}

export async function proposeHypothesis(caseId: string, statement: string): Promise<Hypothesis> {
  return apiFetch<Hypothesis>(`/cases/${encodeURIComponent(caseId)}/hypotheses`, {
    method: "POST",
    body: JSON.stringify({ statement }),
  });
}

export async function validateHypothesis(
  caseId: string,
  hypothesisId: string,
  conclusionStatement: string,
): Promise<Hypothesis> {
  return apiFetch<Hypothesis>(
    `/cases/${encodeURIComponent(caseId)}/hypotheses/${encodeURIComponent(hypothesisId)}/validate`,
    { method: "POST", body: JSON.stringify({ conclusionStatement }) },
  );
}

export async function rejectHypothesis(caseId: string, hypothesisId: string): Promise<Hypothesis> {
  return apiFetch<Hypothesis>(
    `/cases/${encodeURIComponent(caseId)}/hypotheses/${encodeURIComponent(hypothesisId)}/reject`,
    { method: "POST" },
  );
}

export async function linkEvidenceToHypothesis(
  caseId: string,
  hypothesisId: string,
  evidenceId: string,
): Promise<Evidence> {
  return apiFetch<Evidence>(
    `/cases/${encodeURIComponent(caseId)}/hypotheses/${encodeURIComponent(hypothesisId)}/evidence`,
    { method: "POST", body: JSON.stringify({ evidenceId }) },
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web && npx jest features/investigations/service.test.ts`
Expected: PASS (6/6).

- [ ] **Step 5: Write the failing tests for `features/evidence/service.ts`**

Create `apps/web/features/evidence/service.test.ts`:

```ts
/** @jest-environment node */
jest.mock("../../lib/server/api-client", () => {
  const actual = jest.requireActual("../../lib/server/api-client");
  return { ...actual, apiFetch: jest.fn() };
});

import { apiFetch } from "../../lib/server/api-client";
import { addEvidence, listEvidence } from "./service";

describe("evidence service", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("listEvidence calls GET /cases/:id/evidence", async () => {
    (apiFetch as jest.Mock).mockResolvedValue([]);
    await listEvidence("c1");
    expect(apiFetch).toHaveBeenCalledWith("/cases/c1/evidence");
  });

  it("addEvidence posts the type/source/content/timestamp", async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ id: "e1" });
    await addEvidence("c1", {
      type: "LOG",
      source: "auth-server",
      content: "Failed login at 03:00 UTC",
      timestamp: "2026-08-20T03:00:00.000Z",
    });
    expect(apiFetch).toHaveBeenCalledWith("/cases/c1/evidence", {
      method: "POST",
      body: JSON.stringify({
        type: "LOG",
        source: "auth-server",
        content: "Failed login at 03:00 UTC",
        timestamp: "2026-08-20T03:00:00.000Z",
      }),
    });
  });

  it("encodes the case id when building the request path", async () => {
    (apiFetch as jest.Mock).mockResolvedValue([]);
    await listEvidence("has space/slash");
    expect(apiFetch).toHaveBeenCalledWith("/cases/has%20space%2Fslash/evidence");
  });
});
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `cd apps/web && npx jest features/evidence/service.test.ts`
Expected: FAIL — `./service` doesn't exist yet.

- [ ] **Step 7: Implement `features/evidence/service.ts`**

Create `apps/web/features/evidence/service.ts`:

```ts
import "server-only";
import { apiFetch } from "../../lib/server/api-client";
import type { Evidence, EvidenceType } from "../../lib/api/types";

export async function listEvidence(caseId: string): Promise<Evidence[]> {
  return apiFetch<Evidence[]>(`/cases/${encodeURIComponent(caseId)}/evidence`);
}

export interface AddEvidenceInput {
  type: EvidenceType;
  source: string;
  content: string;
  timestamp: string;
}

export async function addEvidence(caseId: string, input: AddEvidenceInput): Promise<Evidence> {
  return apiFetch<Evidence>(`/cases/${encodeURIComponent(caseId)}/evidence`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `cd apps/web && npx jest features/investigations/service.test.ts features/evidence/service.test.ts`
Expected: PASS (6/6 and 3/3).

- [ ] **Step 9: Commit**

```bash
git add apps/web/features/investigations/service.ts apps/web/features/investigations/service.test.ts apps/web/features/evidence/service.ts apps/web/features/evidence/service.test.ts
git commit -m "feat(web): add investigations and evidence service layers"
```

## Task 3: Hypothesis action Server Actions and forms

**Files:**
- Modify: `apps/web/app/(workspace)/cases/[id]/actions.ts`
- Create: `apps/web/app/(workspace)/cases/[id]/propose-hypothesis-form.tsx`
- Create: `apps/web/app/(workspace)/cases/[id]/propose-hypothesis-form.test.tsx`
- Create: `apps/web/app/(workspace)/cases/[id]/validate-hypothesis-form.tsx`
- Create: `apps/web/app/(workspace)/cases/[id]/validate-hypothesis-form.test.tsx`
- Create: `apps/web/app/(workspace)/cases/[id]/reject-hypothesis-form.tsx`
- Create: `apps/web/app/(workspace)/cases/[id]/reject-hypothesis-form.test.tsx`
- Create: `apps/web/app/(workspace)/cases/[id]/link-evidence-form.tsx`
- Create: `apps/web/app/(workspace)/cases/[id]/link-evidence-form.test.tsx`

**Interfaces:**
- Consumes: `proposeHypothesis`, `validateHypothesis`, `rejectHypothesis`, `linkEvidenceToHypothesis` (Task 2); the existing `CaseActionState`, `ApiError`, `Button`, `FormError`.
- Produces: `proposeHypothesisAction`, `validateHypothesisAction`, `rejectHypothesisAction`, `linkEvidenceAction` (Server Actions, appended to the existing `actions.ts`); `<ProposeHypothesisForm caseId />`, `<ValidateHypothesisForm caseId hypothesisId />`, `<RejectHypothesisForm caseId hypothesisId />`, `<LinkEvidenceForm caseId hypothesisId evidenceOptions={{id,source}[]} />` — all consumed by Task 5's page.

- [ ] **Step 1: Write the failing tests for the four form components**

Create `apps/web/app/(workspace)/cases/[id]/propose-hypothesis-form.test.tsx`:

```tsx
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { ProposeHypothesisForm } from "./propose-hypothesis-form";

describe("ProposeHypothesisForm", () => {
  it("renders a required statement field and a submit button", () => {
    render(<ProposeHypothesisForm caseId="c1" />);
    expect(screen.getByLabelText(/propose a hypothesis/i)).toBeRequired();
    expect(screen.getByRole("button", { name: /propose hypothesis/i })).toBeInTheDocument();
  });

  it("includes the case id as a hidden field", () => {
    const { container } = render(<ProposeHypothesisForm caseId="c1" />);
    expect(container.querySelector('input[type="hidden"][name="caseId"]')).toHaveValue("c1");
  });
});
```

Create `apps/web/app/(workspace)/cases/[id]/validate-hypothesis-form.test.tsx`:

```tsx
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { ValidateHypothesisForm } from "./validate-hypothesis-form";

describe("ValidateHypothesisForm", () => {
  it("renders a required conclusion field and a validate button", () => {
    render(<ValidateHypothesisForm caseId="c1" hypothesisId="h1" />);
    expect(screen.getByLabelText(/conclusion/i)).toBeRequired();
    expect(screen.getByRole("button", { name: /validate/i })).toBeInTheDocument();
  });

  it("includes the case id and hypothesis id as hidden fields", () => {
    const { container } = render(<ValidateHypothesisForm caseId="c1" hypothesisId="h1" />);
    expect(container.querySelector('input[type="hidden"][name="caseId"]')).toHaveValue("c1");
    expect(container.querySelector('input[type="hidden"][name="hypothesisId"]')).toHaveValue("h1");
  });
});
```

Create `apps/web/app/(workspace)/cases/[id]/reject-hypothesis-form.test.tsx`:

```tsx
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { RejectHypothesisForm } from "./reject-hypothesis-form";

describe("RejectHypothesisForm", () => {
  it("renders a reject button with secondary styling", () => {
    render(<RejectHypothesisForm caseId="c1" hypothesisId="h1" />);
    expect(screen.getByRole("button", { name: /reject/i })).toHaveClass("border");
  });

  it("includes the case id and hypothesis id as hidden fields", () => {
    const { container } = render(<RejectHypothesisForm caseId="c1" hypothesisId="h1" />);
    expect(container.querySelector('input[type="hidden"][name="caseId"]')).toHaveValue("c1");
    expect(container.querySelector('input[type="hidden"][name="hypothesisId"]')).toHaveValue("h1");
  });
});
```

Create `apps/web/app/(workspace)/cases/[id]/link-evidence-form.test.tsx`:

```tsx
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { LinkEvidenceForm } from "./link-evidence-form";

describe("LinkEvidenceForm", () => {
  it("renders an evidence select populated from the given options", () => {
    render(
      <LinkEvidenceForm caseId="c1" hypothesisId="h1" evidenceOptions={[{ id: "e1", source: "auth-server" }]} />,
    );
    expect(screen.getByLabelText(/link evidence/i)).toBeInTheDocument();
    expect(screen.getByText("auth-server")).toBeInTheDocument();
  });

  it("disables the submit button when there is no unlinked evidence", () => {
    render(<LinkEvidenceForm caseId="c1" hypothesisId="h1" evidenceOptions={[]} />);
    expect(screen.getByRole("button", { name: /link evidence/i })).toBeDisabled();
  });

  it("includes the case id and hypothesis id as hidden fields", () => {
    const { container } = render(<LinkEvidenceForm caseId="c1" hypothesisId="h1" evidenceOptions={[]} />);
    expect(container.querySelector('input[type="hidden"][name="caseId"]')).toHaveValue("c1");
    expect(container.querySelector('input[type="hidden"][name="hypothesisId"]')).toHaveValue("h1");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && npx jest propose-hypothesis-form validate-hypothesis-form reject-hypothesis-form link-evidence-form`
Expected: FAIL — none of the four component modules exist yet.

- [ ] **Step 3: Extend `actions.ts` with the four new Server Actions**

In `apps/web/app/(workspace)/cases/[id]/actions.ts`, change the import line:

```ts
import { addComment, addNote, reassignCase, transitionCase } from "@/features/cases/service";
```

to:

```ts
import { addComment, addNote, reassignCase, transitionCase } from "@/features/cases/service";
import {
  linkEvidenceToHypothesis,
  proposeHypothesis,
  rejectHypothesis,
  validateHypothesis,
} from "@/features/investigations/service";
```

Add, after the existing `addCommentAction` function (end of file):

```ts

export async function proposeHypothesisAction(
  _prevState: CaseActionState,
  formData: FormData,
): Promise<CaseActionState> {
  const caseId = caseIdOf(formData);
  const statement = String(formData.get("statement") ?? "").trim();

  if (!statement) {
    return { error: "A hypothesis statement is required." };
  }

  try {
    await proposeHypothesis(caseId, statement);
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: error.message };
    }
    return { error: "Something went wrong. Please try again." };
  }
  redirect(`/cases/${caseId}`);
}

export async function validateHypothesisAction(
  _prevState: CaseActionState,
  formData: FormData,
): Promise<CaseActionState> {
  const caseId = caseIdOf(formData);
  const hypothesisId = String(formData.get("hypothesisId") ?? "");
  const conclusionStatement = String(formData.get("conclusionStatement") ?? "").trim();

  if (!conclusionStatement) {
    return { error: "A conclusion statement is required." };
  }

  try {
    await validateHypothesis(caseId, hypothesisId, conclusionStatement);
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: error.message };
    }
    return { error: "Something went wrong. Please try again." };
  }
  redirect(`/cases/${caseId}`);
}

export async function rejectHypothesisAction(
  _prevState: CaseActionState,
  formData: FormData,
): Promise<CaseActionState> {
  const caseId = caseIdOf(formData);
  const hypothesisId = String(formData.get("hypothesisId") ?? "");

  try {
    await rejectHypothesis(caseId, hypothesisId);
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: error.message };
    }
    return { error: "Something went wrong. Please try again." };
  }
  redirect(`/cases/${caseId}`);
}

export async function linkEvidenceAction(
  _prevState: CaseActionState,
  formData: FormData,
): Promise<CaseActionState> {
  const caseId = caseIdOf(formData);
  const hypothesisId = String(formData.get("hypothesisId") ?? "");
  const evidenceId = String(formData.get("evidenceId") ?? "");

  if (!evidenceId) {
    return { error: "Choose a piece of evidence to link." };
  }

  try {
    await linkEvidenceToHypothesis(caseId, hypothesisId, evidenceId);
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: error.message };
    }
    return { error: "Something went wrong. Please try again." };
  }
  redirect(`/cases/${caseId}`);
}
```

- [ ] **Step 4: Implement `propose-hypothesis-form.tsx`**

Create `apps/web/app/(workspace)/cases/[id]/propose-hypothesis-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { proposeHypothesisAction, type CaseActionState } from "./actions";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form-error";

const initialState: CaseActionState = {};

export function ProposeHypothesisForm({ caseId }: { caseId: string }) {
  const [state, formAction, pending] = useActionState(proposeHypothesisAction, initialState);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="caseId" value={caseId} />
      <div className="space-y-1">
        <label htmlFor={`hypothesis-statement-${caseId}`} className="block text-sm font-medium">
          Propose a hypothesis
        </label>
        <textarea
          id={`hypothesis-statement-${caseId}`}
          name="statement"
          required
          maxLength={2000}
          className="w-full rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent"
        />
      </div>
      {state.error && <FormError message={state.error} />}
      <Button type="submit" disabled={pending}>
        {pending ? "Proposing…" : "Propose hypothesis"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 5: Implement `validate-hypothesis-form.tsx`**

Create `apps/web/app/(workspace)/cases/[id]/validate-hypothesis-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { validateHypothesisAction, type CaseActionState } from "./actions";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form-error";

const initialState: CaseActionState = {};

export function ValidateHypothesisForm({
  caseId,
  hypothesisId,
}: {
  caseId: string;
  hypothesisId: string;
}) {
  const [state, formAction, pending] = useActionState(validateHypothesisAction, initialState);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="caseId" value={caseId} />
      <input type="hidden" name="hypothesisId" value={hypothesisId} />
      <div className="space-y-1">
        <label htmlFor={`conclusion-${hypothesisId}`} className="block text-sm font-medium">
          Conclusion
        </label>
        <textarea
          id={`conclusion-${hypothesisId}`}
          name="conclusionStatement"
          required
          maxLength={2000}
          className="w-full rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent"
        />
      </div>
      {state.error && <FormError message={state.error} />}
      <Button type="submit" disabled={pending}>
        {pending ? "Validating…" : "Validate"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 6: Implement `reject-hypothesis-form.tsx`**

Create `apps/web/app/(workspace)/cases/[id]/reject-hypothesis-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { rejectHypothesisAction, type CaseActionState } from "./actions";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form-error";

const initialState: CaseActionState = {};

export function RejectHypothesisForm({
  caseId,
  hypothesisId,
}: {
  caseId: string;
  hypothesisId: string;
}) {
  const [state, formAction, pending] = useActionState(rejectHypothesisAction, initialState);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="caseId" value={caseId} />
      <input type="hidden" name="hypothesisId" value={hypothesisId} />
      {state.error && <FormError message={state.error} />}
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Rejecting…" : "Reject"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 7: Implement `link-evidence-form.tsx`**

Create `apps/web/app/(workspace)/cases/[id]/link-evidence-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { linkEvidenceAction, type CaseActionState } from "./actions";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form-error";

const initialState: CaseActionState = {};

export function LinkEvidenceForm({
  caseId,
  hypothesisId,
  evidenceOptions,
}: {
  caseId: string;
  hypothesisId: string;
  evidenceOptions: { id: string; source: string }[];
}) {
  const [state, formAction, pending] = useActionState(linkEvidenceAction, initialState);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="caseId" value={caseId} />
      <input type="hidden" name="hypothesisId" value={hypothesisId} />
      <div className="space-y-1">
        <label htmlFor={`link-evidence-${hypothesisId}`} className="block text-sm font-medium">
          Link evidence
        </label>
        <select
          id={`link-evidence-${hypothesisId}`}
          name="evidenceId"
          required
          className="w-full rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent"
        >
          <option value="">Choose evidence</option>
          {evidenceOptions.map((evidence) => (
            <option key={evidence.id} value={evidence.id}>
              {evidence.source}
            </option>
          ))}
        </select>
      </div>
      {state.error && <FormError message={state.error} />}
      <Button type="submit" variant="secondary" disabled={pending || evidenceOptions.length === 0}>
        {pending ? "Linking…" : "Link evidence"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `cd apps/web && npx jest propose-hypothesis-form validate-hypothesis-form reject-hypothesis-form link-evidence-form`
Expected: PASS (2/2, 2/2, 2/2, 3/3).

- [ ] **Step 9: Commit**

```bash
git add "apps/web/app/(workspace)/cases/[id]/actions.ts" "apps/web/app/(workspace)/cases/[id]/propose-hypothesis-form.tsx" "apps/web/app/(workspace)/cases/[id]/propose-hypothesis-form.test.tsx" "apps/web/app/(workspace)/cases/[id]/validate-hypothesis-form.tsx" "apps/web/app/(workspace)/cases/[id]/validate-hypothesis-form.test.tsx" "apps/web/app/(workspace)/cases/[id]/reject-hypothesis-form.tsx" "apps/web/app/(workspace)/cases/[id]/reject-hypothesis-form.test.tsx" "apps/web/app/(workspace)/cases/[id]/link-evidence-form.tsx" "apps/web/app/(workspace)/cases/[id]/link-evidence-form.test.tsx"
git commit -m "feat(web): add propose/validate/reject/link-evidence hypothesis actions and forms"
```

## Task 4: Evidence Server Action and form

**Files:**
- Modify: `apps/web/app/(workspace)/cases/[id]/actions.ts`
- Create: `apps/web/app/(workspace)/cases/[id]/add-evidence-form.tsx`
- Create: `apps/web/app/(workspace)/cases/[id]/add-evidence-form.test.tsx`

**Interfaces:**
- Consumes: `addEvidence` (Task 2, `features/evidence/service.ts`); `EvidenceType` (Task 1); `TextField` (existing primitive).
- Produces: `addEvidenceAction` (appended to `actions.ts`); `<AddEvidenceForm caseId />` — consumed by Task 5's page.

- [ ] **Step 1: Write the failing test**

Create `apps/web/app/(workspace)/cases/[id]/add-evidence-form.test.tsx`:

```tsx
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { AddEvidenceForm } from "./add-evidence-form";

describe("AddEvidenceForm", () => {
  it("renders type, source, content, and timestamp fields, all required", () => {
    render(<AddEvidenceForm caseId="c1" />);
    expect(screen.getByLabelText(/type/i)).toBeRequired();
    expect(screen.getByLabelText(/source/i)).toBeRequired();
    expect(screen.getByLabelText(/content/i)).toBeRequired();
    expect(screen.getByLabelText(/observed at/i)).toBeRequired();
  });

  it("includes the case id as a hidden field", () => {
    const { container } = render(<AddEvidenceForm caseId="c1" />);
    expect(container.querySelector('input[type="hidden"][name="caseId"]')).toHaveValue("c1");
  });

  it("renders every EvidenceType as a select option", () => {
    render(<AddEvidenceForm caseId="c1" />);
    for (const type of ["LOG", "SCREENSHOT", "FILE", "URL", "COMMAND_OUTPUT", "OTHER"]) {
      expect(screen.getByRole("option", { name: type })).toBeInTheDocument();
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && npx jest add-evidence-form.test.tsx`
Expected: FAIL — `./add-evidence-form` doesn't exist yet.

- [ ] **Step 3: Extend `actions.ts` with `addEvidenceAction`**

In `apps/web/app/(workspace)/cases/[id]/actions.ts`, change the import block from:

```ts
import { redirect } from "next/navigation";
import { addComment, addNote, reassignCase, transitionCase } from "@/features/cases/service";
import {
  linkEvidenceToHypothesis,
  proposeHypothesis,
  rejectHypothesis,
  validateHypothesis,
} from "@/features/investigations/service";
import { ApiError } from "@/lib/server/api-client";
import type { CaseAction } from "@/lib/api/types";
```

to:

```ts
import { redirect } from "next/navigation";
import { addComment, addNote, reassignCase, transitionCase } from "@/features/cases/service";
import {
  linkEvidenceToHypothesis,
  proposeHypothesis,
  rejectHypothesis,
  validateHypothesis,
} from "@/features/investigations/service";
import { addEvidence } from "@/features/evidence/service";
import { ApiError } from "@/lib/server/api-client";
import type { CaseAction, EvidenceType } from "@/lib/api/types";

const EVIDENCE_TYPES: EvidenceType[] = ["LOG", "SCREENSHOT", "FILE", "URL", "COMMAND_OUTPUT", "OTHER"];
```

Add, after `linkEvidenceAction` (end of file):

```ts

export async function addEvidenceAction(
  _prevState: CaseActionState,
  formData: FormData,
): Promise<CaseActionState> {
  const caseId = caseIdOf(formData);
  const type = String(formData.get("type") ?? "") as EvidenceType;
  const source = String(formData.get("source") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  const timestampRaw = String(formData.get("timestamp") ?? "");

  if (!EVIDENCE_TYPES.includes(type)) {
    return { error: "Evidence type is required." };
  }
  if (!source) {
    return { error: "Source is required." };
  }
  if (!content) {
    return { error: "Content is required." };
  }
  const timestampMs = new Date(timestampRaw).getTime();
  if (!timestampRaw || Number.isNaN(timestampMs)) {
    return { error: "A valid timestamp is required." };
  }

  try {
    await addEvidence(caseId, { type, source, content, timestamp: new Date(timestampMs).toISOString() });
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: error.message };
    }
    return { error: "Something went wrong. Please try again." };
  }
  redirect(`/cases/${caseId}`);
}
```

- [ ] **Step 4: Implement `add-evidence-form.tsx`**

Create `apps/web/app/(workspace)/cases/[id]/add-evidence-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { addEvidenceAction, type CaseActionState } from "./actions";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { FormError } from "@/components/ui/form-error";

const initialState: CaseActionState = {};

const EVIDENCE_TYPE_OPTIONS = ["LOG", "SCREENSHOT", "FILE", "URL", "COMMAND_OUTPUT", "OTHER"] as const;

export function AddEvidenceForm({ caseId }: { caseId: string }) {
  const [state, formAction, pending] = useActionState(addEvidenceAction, initialState);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="caseId" value={caseId} />
      <div className="space-y-1">
        <label htmlFor={`evidence-type-${caseId}`} className="block text-sm font-medium">
          Type
        </label>
        <select
          id={`evidence-type-${caseId}`}
          name="type"
          required
          className="w-full rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent"
        >
          <option value="">Select type</option>
          {EVIDENCE_TYPE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
      <TextField label="Source" name="source" required maxLength={200} />
      <div className="space-y-1">
        <label htmlFor={`evidence-content-${caseId}`} className="block text-sm font-medium">
          Content
        </label>
        <textarea
          id={`evidence-content-${caseId}`}
          name="content"
          required
          maxLength={10000}
          className="w-full rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent"
        />
      </div>
      <div className="space-y-1">
        <label htmlFor={`evidence-timestamp-${caseId}`} className="block text-sm font-medium">
          Observed at
        </label>
        <input
          id={`evidence-timestamp-${caseId}`}
          name="timestamp"
          type="datetime-local"
          required
          className="w-full rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent"
        />
      </div>
      {state.error && <FormError message={state.error} />}
      <Button type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add evidence"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd apps/web && npx jest add-evidence-form.test.tsx`
Expected: PASS (3/3).

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/(workspace)/cases/[id]/actions.ts" "apps/web/app/(workspace)/cases/[id]/add-evidence-form.tsx" "apps/web/app/(workspace)/cases/[id]/add-evidence-form.test.tsx"
git commit -m "feat(web): add evidence Server Action and form"
```

## Task 5: Case detail page integration

**Files:**
- Modify: `apps/web/app/(workspace)/cases/[id]/page.tsx`
- Modify: `apps/web/app/(workspace)/cases/[id]/page.test.tsx`

**Interfaces:**
- Consumes: `listHypotheses`, `listEvidence` (Task 2); `HYPOTHESIS_STATUS_BADGE_TONE` (Task 1); `ProposeHypothesisForm`, `ValidateHypothesisForm`, `RejectHypothesisForm`, `LinkEvidenceForm` (Task 3), `AddEvidenceForm` (Task 4).
- Produces: the finished `/cases/[id]` page with "Hypotheses" and "Evidence" sections. This is the last task before verification — nothing downstream consumes new interfaces from it.

- [ ] **Step 1: Write the failing tests**

In `apps/web/app/(workspace)/cases/[id]/page.test.tsx`, add these two mocks alongside the existing three (`jest.mock("../../../../features/auth/dal", ...)`, `jest.mock("../../../../features/cases/service", ...)`, `jest.mock("../../../../features/users/service", ...)`):

```ts
jest.mock("../../../../features/investigations/service", () => ({
  listHypotheses: jest.fn(),
}));
jest.mock("../../../../features/evidence/service", () => ({
  listEvidence: jest.fn(),
}));
```

Add the matching imports alongside the existing ones:

```ts
import { listHypotheses } from "../../../../features/investigations/service";
import { listEvidence } from "../../../../features/evidence/service";
```

In the `beforeEach`, add default resolved values so every existing test (which doesn't care about hypotheses/evidence) keeps passing unmodified:

```ts
    (listHypotheses as jest.Mock).mockResolvedValue([]);
    (listEvidence as jest.Mock).mockResolvedValue([]);
```

Add these new tests (after the existing `"hides add-note and add-comment forms when the case is resolved"` test):

```tsx
  it("renders hypotheses with their status badge", async () => {
    (getCase as jest.Mock).mockResolvedValue(kase);
    (listHypotheses as jest.Mock).mockResolvedValue([
      {
        id: "h1",
        caseId: "c1",
        authorId: "u1",
        statement: "Phishing led to credential theft",
        status: "proposed",
        conclusionStatement: null,
        resolvedAt: null,
        createdAt: "2026-08-20T00:00:00.000Z",
      },
    ]);

    const jsx = await CaseDetailPage({ params: Promise.resolve({ id: "c1" }) });
    render(jsx);

    expect(screen.getByText("Phishing led to credential theft")).toBeInTheDocument();
    expect(screen.getByText("proposed")).toBeInTheDocument();
  });

  it("renders a message when no hypotheses have been proposed", async () => {
    (getCase as jest.Mock).mockResolvedValue(kase);
    const jsx = await CaseDetailPage({ params: Promise.resolve({ id: "c1" }) });
    render(jsx);
    expect(screen.getByText(/no hypotheses proposed yet/i)).toBeInTheDocument();
  });

  it("shows validate/reject/link-evidence controls only for a proposed hypothesis, on a non-resolved case", async () => {
    (getCase as jest.Mock).mockResolvedValue(kase); // status: INVESTIGATING
    (listHypotheses as jest.Mock).mockResolvedValue([
      {
        id: "h1",
        caseId: "c1",
        authorId: "u1",
        statement: "Proposed one",
        status: "proposed",
        conclusionStatement: null,
        resolvedAt: null,
        createdAt: "2026-08-20T00:00:00.000Z",
      },
      {
        id: "h2",
        caseId: "c1",
        authorId: "u1",
        statement: "Already validated",
        status: "validated",
        conclusionStatement: "Confirmed via logs",
        resolvedAt: "2026-08-20T01:00:00.000Z",
        createdAt: "2026-08-20T00:00:00.000Z",
      },
    ]);

    const jsx = await CaseDetailPage({ params: Promise.resolve({ id: "c1" }) });
    render(jsx);

    expect(screen.getByLabelText(/^conclusion$/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^reject$/i })).toBeInTheDocument();
    expect(screen.getByText("Confirmed via logs")).toBeInTheDocument();
  });

  it("hides propose/validate/reject/link-evidence controls when the case is resolved", async () => {
    (getCase as jest.Mock).mockResolvedValue({ ...kase, status: "RESOLVED", resolutionSummary: "Done." });
    (listHypotheses as jest.Mock).mockResolvedValue([
      {
        id: "h1",
        caseId: "c1",
        authorId: "u1",
        statement: "Proposed one",
        status: "proposed",
        conclusionStatement: null,
        resolvedAt: null,
        createdAt: "2026-08-20T00:00:00.000Z",
      },
    ]);

    const jsx = await CaseDetailPage({ params: Promise.resolve({ id: "c1" }) });
    render(jsx);

    expect(screen.queryByLabelText(/propose a hypothesis/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^conclusion$/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^reject$/i })).not.toBeInTheDocument();
  });

  it("renders evidence with type, source, and timestamp", async () => {
    (getCase as jest.Mock).mockResolvedValue(kase);
    (listEvidence as jest.Mock).mockResolvedValue([
      {
        id: "e1",
        caseId: "c1",
        timelineEventId: "te1",
        hypothesisId: null,
        type: "LOG",
        source: "auth-server",
        content: "Failed login at 03:00 UTC",
        timestamp: "2026-08-20T03:00:00.000Z",
        authorId: "u1",
        createdAt: "2026-08-20T03:05:00.000Z",
      },
    ]);

    const jsx = await CaseDetailPage({ params: Promise.resolve({ id: "c1" }) });
    render(jsx);

    expect(screen.getByText(/auth-server/)).toBeInTheDocument();
    expect(screen.getByText("Failed login at 03:00 UTC")).toBeInTheDocument();
  });

  it("renders a message when no evidence has been recorded", async () => {
    (getCase as jest.Mock).mockResolvedValue(kase);
    const jsx = await CaseDetailPage({ params: Promise.resolve({ id: "c1" }) });
    render(jsx);
    expect(screen.getByText(/no evidence recorded yet/i)).toBeInTheDocument();
  });

  it("shows which hypothesis a piece of evidence is linked to", async () => {
    (getCase as jest.Mock).mockResolvedValue(kase);
    (listHypotheses as jest.Mock).mockResolvedValue([
      {
        id: "h1",
        caseId: "c1",
        authorId: "u1",
        statement: "Phishing led to credential theft",
        status: "proposed",
        conclusionStatement: null,
        resolvedAt: null,
        createdAt: "2026-08-20T00:00:00.000Z",
      },
    ]);
    (listEvidence as jest.Mock).mockResolvedValue([
      {
        id: "e1",
        caseId: "c1",
        timelineEventId: "te1",
        hypothesisId: "h1",
        type: "LOG",
        source: "auth-server",
        content: "Failed login at 03:00 UTC",
        timestamp: "2026-08-20T03:00:00.000Z",
        authorId: "u1",
        createdAt: "2026-08-20T03:05:00.000Z",
      },
    ]);

    const jsx = await CaseDetailPage({ params: Promise.resolve({ id: "c1" }) });
    render(jsx);

    expect(screen.getByText(/linked to hypothesis/i)).toBeInTheDocument();
    expect(screen.getByText(/phishing led to credential theft/i)).toBeInTheDocument();
  });

  it("hides the add-evidence form when the case is resolved", async () => {
    (getCase as jest.Mock).mockResolvedValue({ ...kase, status: "RESOLVED", resolutionSummary: "Done." });
    const jsx = await CaseDetailPage({ params: Promise.resolve({ id: "c1" }) });
    render(jsx);
    expect(screen.queryByLabelText(/^type$/i)).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && npx jest "cases/\[id\]/page.test.tsx"`
Expected: FAIL — the page doesn't render Hypotheses/Evidence sections yet.

- [ ] **Step 3: Implement the page changes**

In `apps/web/app/(workspace)/cases/[id]/page.tsx`, change the import block from:

```tsx
import { verifySession } from "@/features/auth/dal";
import { getCase, listCaseTimelineEntries } from "@/features/cases/service";
import { listUsers } from "@/features/users/service";
import { buildUserNameMap, resolveUserName } from "@/lib/format-user";
import { ApiError } from "@/lib/server/api-client";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Section } from "@/components/ui/section";
import { CASE_STATUS_BADGE_TONE, SEVERITY_BADGE_TONE } from "@/lib/badge-tones";
import { getAvailableActions } from "@/lib/case-transitions";
import { extractHumanEntries } from "@/lib/case-notes";
import { TransitionButton } from "./transition-button";
import { ReassignForm } from "./reassign-form";
import { CaseEntryForm } from "./case-entry-form";
import { addCommentAction, addNoteAction } from "./actions";
```

to:

```tsx
import { verifySession } from "@/features/auth/dal";
import { getCase, listCaseTimelineEntries } from "@/features/cases/service";
import { listUsers } from "@/features/users/service";
import { listHypotheses } from "@/features/investigations/service";
import { listEvidence } from "@/features/evidence/service";
import { buildUserNameMap, resolveUserName } from "@/lib/format-user";
import { ApiError } from "@/lib/server/api-client";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Section } from "@/components/ui/section";
import { CASE_STATUS_BADGE_TONE, HYPOTHESIS_STATUS_BADGE_TONE, SEVERITY_BADGE_TONE } from "@/lib/badge-tones";
import { getAvailableActions } from "@/lib/case-transitions";
import { extractHumanEntries } from "@/lib/case-notes";
import { TransitionButton } from "./transition-button";
import { ReassignForm } from "./reassign-form";
import { CaseEntryForm } from "./case-entry-form";
import { ProposeHypothesisForm } from "./propose-hypothesis-form";
import { ValidateHypothesisForm } from "./validate-hypothesis-form";
import { RejectHypothesisForm } from "./reject-hypothesis-form";
import { LinkEvidenceForm } from "./link-evidence-form";
import { AddEvidenceForm } from "./add-evidence-form";
import { addCommentAction, addNoteAction } from "./actions";
```

Change the data-fetching line from:

```tsx
  const [users, timeline] = await Promise.all([listUsers(), listCaseTimelineEntries(id)]);
  const userNames = buildUserNameMap(users);
```

to:

```tsx
  const [users, timeline, hypotheses, evidence] = await Promise.all([
    listUsers(),
    listCaseTimelineEntries(id),
    listHypotheses(id),
    listEvidence(id),
  ]);
  const userNames = buildUserNameMap(users);
  const isResolved = kase.status === "RESOLVED";
  const unlinkedEvidence = evidence.filter((item) => item.hypothesisId === null);
  const evidenceByHypothesis = new Map<string, typeof evidence>();
  for (const item of evidence) {
    if (!item.hypothesisId) continue;
    const existing = evidenceByHypothesis.get(item.hypothesisId) ?? [];
    existing.push(item);
    evidenceByHypothesis.set(item.hypothesisId, existing);
  }
  const hypothesesById = new Map(hypotheses.map((hypothesis) => [hypothesis.id, hypothesis]));
```

Insert two new `Section`s between the existing `"Actions"` section and the existing `"Notes & Comments"` section — i.e. immediately after this closing tag:

```tsx
      </Section>

      <Section title="Notes & Comments" className="space-y-4">
```

insert, before `<Section title="Notes & Comments"`:

```tsx
      <Section title="Hypotheses">
        {hypotheses.length === 0 ? (
          <p className="text-sm text-black/60 dark:text-white/60">No hypotheses proposed yet.</p>
        ) : (
          <ul className="space-y-3">
            {hypotheses.map((hypothesis) => {
              const linkedEvidence = evidenceByHypothesis.get(hypothesis.id) ?? [];
              return (
                <Card key={hypothesis.id} as="li" className="space-y-2 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm">{hypothesis.statement}</p>
                    <Badge tone={HYPOTHESIS_STATUS_BADGE_TONE[hypothesis.status]}>{hypothesis.status}</Badge>
                  </div>
                  {hypothesis.status !== "proposed" && hypothesis.conclusionStatement && (
                    <p className="text-sm text-black/60 dark:text-white/60">
                      <span className="font-medium">Conclusion: </span>
                      {hypothesis.conclusionStatement}
                    </p>
                  )}
                  {linkedEvidence.length > 0 && (
                    <p className="text-xs text-black/60 dark:text-white/60">
                      Linked evidence: {linkedEvidence.map((item) => item.source).join(", ")}
                    </p>
                  )}
                  {hypothesis.status === "proposed" && !isResolved && (
                    <div className="grid gap-4 sm:grid-cols-3">
                      <ValidateHypothesisForm caseId={kase.id} hypothesisId={hypothesis.id} />
                      <RejectHypothesisForm caseId={kase.id} hypothesisId={hypothesis.id} />
                      <LinkEvidenceForm
                        caseId={kase.id}
                        hypothesisId={hypothesis.id}
                        evidenceOptions={unlinkedEvidence.map((item) => ({ id: item.id, source: item.source }))}
                      />
                    </div>
                  )}
                </Card>
              );
            })}
          </ul>
        )}
        {!isResolved && <ProposeHypothesisForm caseId={kase.id} />}
      </Section>

      <Section title="Evidence">
        {evidence.length === 0 ? (
          <p className="text-sm text-black/60 dark:text-white/60">No evidence recorded yet.</p>
        ) : (
          <ul className="space-y-2">
            {evidence.map((item) => (
              <Card key={item.id} as="li" className="p-3">
                <div className="flex items-center justify-between text-xs text-black/60 dark:text-white/60">
                  <span>
                    {item.type} · {item.source}
                  </span>
                  <span>{new Date(item.timestamp).toLocaleString()}</span>
                </div>
                <p className="mt-1 text-sm">{item.content}</p>
                {item.hypothesisId && (
                  <p className="mt-1 text-xs text-black/50 dark:text-white/50">
                    Linked to hypothesis: {hypothesesById.get(item.hypothesisId)?.statement ?? item.hypothesisId}
                  </p>
                )}
              </Card>
            ))}
          </ul>
        )}
        {!isResolved && <AddEvidenceForm caseId={kase.id} />}
      </Section>

```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web && npx jest "cases/\[id\]/page.test.tsx"`
Expected: PASS, all tests including the pre-existing ones (the new fetches default to empty arrays in every test that doesn't explicitly seed them, so nothing about the existing 15 tests changes behaviorally).

- [ ] **Step 5: Run the full frontend suite, `tsc --noEmit`, and lint**

Run: `cd apps/web && npx jest && npx tsc --noEmit && npm run lint`
Expected: all passing, clean.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/(workspace)/cases/[id]/page.tsx" "apps/web/app/(workspace)/cases/[id]/page.test.tsx"
git commit -m "feat(web): add Hypotheses and Evidence sections to the case detail page"
```

## Task 6: Full-suite verification, live walkthrough, and docs

**Files:**
- Modify: `docs/PROGRESS.md`

- [ ] **Step 1: Backend verification (expect unchanged — this milestone makes zero backend changes)**

Run, from `apps/api/`: `npx jest && npx tsc --noEmit && npm run lint && npx prisma validate && npx prisma migrate status && npm run test:e2e`
Expected: 127/127 unit, 98/98 e2e, clean `tsc`/lint, `prisma validate`/`migrate status` clean (no schema change) — identical to the numbers at the start of this milestone.

- [ ] **Step 2: Frontend verification**

Run, from `apps/web/`: `npx jest && npx tsc --noEmit && npm run lint && npm run build`
Expected: all tests passing (163 existing + roughly 30 new across Tasks 1-5 — record the exact count when run), clean `tsc`/lint, clean `next build`, with **no new route** in the emitted route list (`/cases/[id]` already exists; this milestone adds no new page).

- [ ] **Step 3: Live walkthrough against real dev servers**

Following the exact throwaway-fixture-and-cleanup discipline already established in this repository (see docs/PROGRESS.md's "Cases Workspace", "UI design-system hardening pass", and "Alert Triage Workspace" sections for precedent): start both dev servers against the dedicated `kestro-postgres-dev` container, seed one throwaway Analyst (direct SQL, unavoidable — user creation is Lead-gated and the DB starts empty) and one Case (via the real API), then drive the real flow through the actual UI (via curl against rendered HTML and real Server Action submissions, matching Next 16's `$ACTION_*` progressive-enhancement protocol, since no browser-automation tool is available in this environment):
- Propose two hypotheses on the case; confirm both render with the `proposed` (neutral) badge.
- Add two pieces of evidence with different `type` values; confirm both render in the Evidence section with type/source/timestamp/content.
- Link one evidence item to one hypothesis; confirm the hypothesis card now shows "Linked evidence: ..." and the evidence card shows "Linked to hypothesis: ...".
- Validate the hypothesis with a conclusion statement; confirm its badge turns green and the conclusion renders; confirm its Validate/Reject/Link-evidence controls disappear (terminal state).
- Reject the second hypothesis (no conclusion); confirm its badge turns purple and its controls disappear.
- Resolve the case via its existing lifecycle action; confirm the Hypotheses/Evidence propose/add forms disappear, matching Notes & Comments' existing behavior.
- Confirm a second Analyst without case access still gets the existing 403 `EmptyState` (unaffected by this milestone).
- Delete all throwaway rows afterward, confirm the dev DB is back to empty, stop both dev servers.

- [ ] **Step 4: Update `docs/PROGRESS.md`**

Add a new subsection under "## Phase 2 — Operations Workspace", after "### Alert Triage Workspace", describing what was built (Hypotheses/Evidence sections on the case detail page, zero backend changes, the five new Server Actions, the two new service modules), the verification results (exact test counts from Steps 1-2, plus the live walkthrough from Step 3), and the three confirmed UI decisions from this plan's Global Constraints (always-visible sections; plain-text evidence-type label; `secondary`, not `warning`, for the reject-hypothesis button) so a future reader knows they were deliberate, project-owner-confirmed choices, not oversights. Update the module status table's `Web (Next.js app shell)` row, the "Current task" section, the "Next planned milestone" section, and add a Chronological History row for this milestone's commits.

- [ ] **Step 5: Commit**

```bash
git add docs/PROGRESS.md
git commit -m "docs: record Investigation Workspace completion"
```

## Self-Review

**Spec coverage**: every capability named in the discovery's "smallest coherent milestone" recommendation maps to a task — propose/validate/reject hypotheses (Task 3), add/list evidence (Task 2 + Task 4), link evidence to a hypothesis (Task 2 + Task 3), display both directions of the link (Task 5), gating on `RESOLVED` (Task 5), zero backend changes (no task touches `apps/api/`), no new route/nav item (no task touches `lib/nav.ts` or adds a directory under `app/(workspace)/` other than files inside the existing `cases/[id]/`), no new UI primitive (every component imports only `Badge`/`Card`/`Section`/`Button`/`FormError`/`TextField`).

**Placeholder scan**: no task contains "TBD" or unshown code — every step includes the literal diff or full file content.

**Type consistency**: `Hypothesis`/`Evidence`/`EvidenceType`/`HypothesisStatus` (Task 1) are used identically in Task 2's service signatures, Task 3/4's component props, and Task 5's page derivations (`evidenceByHypothesis: Map<string, Evidence[]>` — read as `typeof evidence` in the plan's diff, matching the array Task 2's `listEvidence` returns). `CaseActionState` (pre-existing) is reused, not redefined, by every new Server Action in Tasks 3-4.
