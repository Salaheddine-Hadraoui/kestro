# Kestro — Progress

Operational tracker for where the project actually stands. Not a duplicate of
docs/ARCHITECTURE.md, docs/PRODUCT.md, docs/WORKFLOW.md, docs/SECURITY.md, or
docs/ROADMAP.md — those remain the source of truth for design; this file
tracks state, history, and what's left. Update it at the completion of each
major milestone.

## Project identity

**Kestro** — SOC Operations & Investigation Platform. Modular monolith:
Next.js frontend (not yet built on), NestJS backend, PostgreSQL via Prisma.
See docs/ARCHITECTURE.md for the full stack decision.

## Current stage

Milestone 1 (Foundation, Auth, Users, Alerts, Cases) is complete. The project
has now moved into **Phase 1** per docs/ROADMAP.md's own sequencing — the
Investigations module (Hypotheses/Validation/Conclusion) is implemented.
This is a deliberate scope transition, explicitly directed, not an
accidental scope-creep: docs/ROADMAP.md and CLAUDE.md both frame
Investigations as "not Milestone 1" specifically because it depends on Cases
existing — Cases is now done, and Phase 1 has begun on that basis.

With Timeline's read API now in place, every module named in Milestone 1
(User, Alert, Case, Timeline Event, Evidence) has both a write path and a
read-back path. Milestone 1 is now fully closed, including its
previously-open Timeline gap.

## Current checkpoint

- Git: `8b29089` on `main` (pushed to origin) — Evidence module.
- Timeline module implemented and verified on top of that; commit pending
  as of this writing (see below).

## Module status

| Module | Status | Notes |
|---|---|---|
| Foundation (DB schema) | Done | users, alerts, cases, case_alerts, timeline_events, evidence, hypotheses tables + enums, all UUID PK |
| Auth | Done | JWT access/refresh, refresh-token rotation + revocation, RolesGuard infra |
| Users | Done | CRUD, Lead-gated management, soft-delete (`disabledAt`) |
| Alerts | Done | create/list/get/dismiss; case-linking explicitly deferred (now resolved by Cases) |
| Cases | Done | full lifecycle state machine, assignment/reassignment, escalation, alert-linking (creation-time and post-creation), visibility scoping. Zero schema changes beyond Milestone-1 foundation. |
| Investigations | Done | Hypothesis propose/validate/reject nested under a case, reusing Cases' visibility rule; one new table (`hypotheses`), zero changes to Case/Alert/User. |
| Evidence | Done | text-based evidence create/list/get nested under a case; each creation also writes the matching `evidence_added` timeline event (required by the pre-existing schema); zero schema changes — the Milestone-1 foundation already had the complete `evidence` table. |
| Timeline | Done | `GET /cases/:caseId/timeline`, read-only, nested under a case; reuses Cases' visibility check; paginated (`limit`/`offset`), deterministic chronological order, author joined in one query; zero schema changes — the Milestone-1 foundation's `timeline_events` table and existing indexes already supported this. |
| Playbooks, Knowledge, AI, Integrations | Not scoped | future phases per docs/ROADMAP.md — do not scaffold |

## Key architectural/domain decisions already made

- **Primary keys**: UUID across all Milestone 1 tables, `@default(uuid())` (client-side generation, not DB-side).
- **Evidence type enum**: `LOG, SCREENSHOT, FILE, URL, COMMAND_OUTPUT, OTHER` (settles the open question in docs/ROADMAP.md).
- **Auth strategy**: short-lived JWT access tokens + long-lived refresh tokens; refresh tokens are server-side revocable via a `refresh_tokens` table keyed by the JWT's own `jti` (rotated on every use); **no** access-token denylist.
- **Alert–Case relationship**: many-to-many-shaped `case_alerts` join table, constrained to one case per alert via a unique index on `alert_id` (settles the open question in docs/ROADMAP.md — still revisitable later per that doc).
- **User soft-delete**: `users.disabledAt` (nullable) instead of hard delete — preserves case/evidence/timeline attribution permanently. Disabling blocks login/refresh/`/auth/me` immediately; a still-valid access token issued before disabling keeps working until its own (short) expiry.
- **User management authorization**: Lead-only for create, role changes, and disable. Any authenticated user can list/view users and update their own name/password (password change requires `currentPassword`; a Lead resetting someone else's password does not).
- **Alert dismissal audit**: `alerts.dismissedById` + `alerts.dismissedAt` added (nullable, required together with the pre-existing `dismissReason` via a CHECK constraint) because `timeline_events.case_id` is required and a dismissed-but-never-linked alert never has a case — docs/SECURITY.md's "who/what/when" for dismissal couldn't otherwise be satisfied.
- **Alert case-linking is out of scope until Cases exists**: no link endpoint, no stub method. `AlertStatus.linked` and `case_alerts` stay unreachable until the Cases module implements the full link transaction (create/attach case, write case_alerts, flip alert status, write timeline event).
- **Alerts have no role gating**: no visibility/ownership scoping in the docs (unlike Cases), so any authenticated Analyst or Lead can create/list/view/dismiss. Contrast with Users, where account management is genuinely Lead-only.
- **Alerts mutate only through named actions** (currently just `dismiss`), not a generic PATCH — mirrors the Case lifecycle's action-based design instead of raw field CRUD.
- **Test strategy**: Prisma 7's WASM query compiler can't load under Jest's CJS runtime, so `PrismaService` is always mocked (in-memory fakes) in unit/e2e tests. Real DB behavior (migrations, CHECK constraints, FK behavior) is verified separately via direct `psql`/manual smoke-testing against the dedicated `kestro-postgres-dev` container, not through Jest.
- **Dev database**: dedicated `kestro-postgres-dev` container, `kestro_dev` on `localhost:5433` — never shared with any other Postgres instance. Always confirmed via `SELECT current_database()` before schema-touching commands.
- **Case lifecycle is one generic `POST /cases/:id/transitions {action}` endpoint**, not 9 dedicated routes — backed by an explicit `(action, fromStatus) → {toStatus, roles}` lookup table matching docs/WORKFLOW.md's 9-row transition table exactly (an action name alone doesn't determine the transition: `escalate` is valid from two different states). No client-suppliable status field anywhere; every transition is validated against this closed table.
- **Case creation's timeline event reuses `status_change`** with `content: {action: 'create', from: null, to: 'OPEN'}` rather than adding a new `TimelineEventType.case_created` enum value — no schema change, and it's queryable as one type for a case's full status history including its birth.
- **Case reassignment produces a timeline event** (type `note`, `content: {event: 'assignee_changed', fromAssigneeId, toAssigneeId}`) even though docs/SECURITY.md's literal audit-required list doesn't name it — decided in favor of audit completeness over the narrowest reading of the doc.
- **Case assignment-at-creation mirrors the reassignment rule**: an Analyst creating a case may only self-assign; a Lead may assign to anyone. This extends docs/WORKFLOW.md's explicit "reassignment is Lead-only" rule to creation time by inference (not stated separately in the docs).
- **Case visibility is a hard server-side boundary, not a filter**: an Analyst's `GET /cases` list is always scoped to their own `assigneeId` regardless of query params; a Lead sees everything and can filter by any `assigneeId`.
- **Linking an alert to a case is now fully implemented** (both at case creation via `alertIds` and post-creation via `POST /cases/:id/alerts`), resolving the deferral noted in the Alerts milestone. A resolved case cannot receive new alert links; only `status: new` alerts can be linked.
- **No severity/title editing on cases** — not called for by any doc; only reassignment (Lead-only, independent of state) exists as a non-lifecycle mutation.
- **No separate `Investigation` table**: `Hypothesis` attaches directly to `Case` (`case_id` FK), matching how `Evidence` already attaches directly to `Case` rather than through an intermediate entity — kept consistent rather than introducing two different patterns for "how child records relate to the investigation."
- **Conclusion is a field on the hypothesis that gets validated** (`conclusionStatement`, required together with `resolvedAt` via a CHECK constraint when `status = validated`), not a separate table — mirrors `cases.resolutionSummary`'s exact conditional pattern. Rejecting a hypothesis requires no reason field (asymmetric with validation, deliberately — docs don't call for one).
- **Hypothesis lifecycle timeline events reuse `note`** with structured `content` (`hypothesis_proposed`/`hypothesis_validated`/`hypothesis_rejected`) — same resolution already used for case reassignment, no new `TimelineEventType` value.
- **Hypothesis actions reuse Cases' own visibility/access check** (`CasesService.findOne`, exported from `CasesModule` for this purpose) rather than duplicating the assignee-or-lead rule — Analyst must be the case's assignee, Lead always allowed.
- **A `RESOLVED` case blocks new hypothesis activity** (create/validate/reject all rejected with 409) — mirrors the existing "resolved case rejects new alert links" rule.
- **No Hypothesis↔Evidence linking yet** — docs/PRODUCT.md describes "evaluating hypotheses against Evidence," but Evidence has no write API at all yet (schema-only). Deferred until Evidence exists, exactly like Alerts deferred Case-linking until Cases existed.
- **Hypothesis status transitions are one-directional** (`proposed → validated` or `proposed → rejected`, terminal) — no reopening in this pass, consistent with keeping scope to what the docs actually describe.
- **Evidence is append-only** — no update/delete endpoints, matching Timeline's explicit append-only philosophy and the general "no generic PATCH" pattern used for Alerts/Cases. Editing a mistake means adding new evidence, not correcting old evidence.
- **Evidence creation writes its timeline event first, then the evidence row referencing it** (`evidence.timeline_event_id` is required and FKs to that event) — the schema's own shape already fixed this design; `TimelineEventType.evidence_added` already existed for exactly this purpose, so no enum/schema decision was needed here (unlike Alert dismissal or Case reassignment, which both needed one).
- **Still no Hypothesis↔Evidence link** even though Evidence now exists — explicitly confirmed to keep Evidence Case-scoped only, consistent with the existing schema (`evidence.case_id`, no `hypothesis_id`). A future nullable FK is the natural additive path if/when this becomes a real need.
- **Evidence list ordering is by `timestamp` ascending** (when the observed fact occurred), not `createdAt` descending like Alerts/Cases — deliberately different, since evidence lists are read as a forensic chronology of what happened, not an operational triage queue of what's newest.
- **Evidence reuses Cases' visibility/access check** and the same "resolved case rejects new activity" rule already applied to alert-linking and hypotheses — no new authorization logic invented.
- **Timeline is read-only, one endpoint, nested under a case** (`GET /cases/:caseId/timeline`): Cases, Investigations, and Evidence already own all the write paths into `timeline_events`, so Timeline adds no write path and no second audit/event system — exactly the append-only design docs/WORKFLOW.md and docs/SECURITY.md already called for.
- **Timeline ordering is `createdAt asc, id asc`**, not `createdAt` alone: several modules write more than one timeline event inside the same transaction (e.g. case creation plus its `alert_linked` events), and Postgres's `now()` resolves to transaction-start time, so those rows can share an identical `createdAt`. The `id` tiebreaker guarantees a stable, repeatable order across pages; it does not reconstruct true insertion order within a tied transaction, which the schema doesn't track and no doc requires.
- **Timeline reuses `CasesService.findOne` for visibility**, identical to Investigations' and Evidence's pattern — Analyst must be the case's assignee, Lead always allowed. No new authorization logic.
- **Timeline is paginated (`limit`/`offset`, default 25, max 100)** rather than returning the full history in one response — same shape as Cases' list endpoint, and necessary since a case's timeline grows unbounded over its lifetime.
- **No N+1 on the author join**: `findMany({ include: { author: ... } })` is a single query pattern that Prisma is left to batch — confirmed via `EXPLAIN` that the `caseId` filter still hits the existing `timeline_events(case_id, created_at)` composite index from the Milestone-1 foundation schema; no new index was needed.

## Important decisions still pending

- **API versioning**: docs/ARCHITECTURE.md says "REST (versioned, JSON)" but no version prefix exists on any route. Flagged five times now as a pre-existing gap, not yet resolved.
- **Alert creation has no actor field** (`createdById`) — docs/SECURITY.md's audit list names dismissal and linking, not creation, and docs/ARCHITECTURE.md's alerts table doesn't include one. Left as-is; worth confirming this is intentional rather than a doc oversight.
- **`VERIFYING → MITIGATING` loop-back** and **alert-linkable-to-multiple-cases** — both explicitly open in docs/ROADMAP.md, unaffected by anything built so far.
- **Hypothesis↔Evidence linking design** — explicitly re-confirmed as deferred (see decisions above); the exact shape (nullable FK vs. join table) isn't decided.
- **Phase 1's other named items** (comments/@mentions, search/filter, case export, richer metrics — docs/ROADMAP.md) remain fully unscoped.

## Current task

Timeline module implementation is complete and verified (see below); commit pending as of this writing. This closes Milestone 1 in full.

## Next planned milestone

Not yet decided. Candidates carried over from earlier milestones: revisit Hypothesis↔Evidence linking now that both sides exist; resolve the still-open API versioning gap; or pick up one of Phase 1's other named items (comments/@mentions, search/filter, case export, richer metrics — docs/ROADMAP.md), none of which are scoped yet.

## Known technical debt / limitations / follow-ups

- No pagination on `GET /users` (fine at current team-size assumptions per docs/PRODUCT.md; revisit if that changes).
- No "logout all sessions" endpoint — refresh tokens revoke individually.
- No re-enable-only endpoint for users beyond `PATCH .../{disabled:false}`.
- `rawPayload` size limits on Alerts rely on Express's default body-parser cap; not explicitly configured.
- No API version prefix (see "pending decisions" above).
- `CasesService.assertAlertsLinkable` validates alerts one at a time in a loop (N queries for N alertIds at case creation) rather than a single batched query — fine at Milestone-1 scale, worth revisiting if bulk alert-linking at creation becomes common.
- No Hypothesis↔Evidence linking (see "pending decisions" above).
- No re-opening of a validated/rejected hypothesis if the conclusion later turns out wrong — would currently require proposing a fresh hypothesis instead.
- No evidence update/delete — intentional (append-only), but means a genuine data-entry mistake in evidence can only be superseded by new evidence, never corrected in place.

## Chronological change history

| Commit | Change |
|---|---|
| `a7efc96` | Initial OpsFlow foundation scaffold |
| `a006f5f` | Renamed project to Kestro |
| `997e76a` | Milestone 1 domain schema: users, alerts, cases, case_alerts, timeline_events, evidence — models, enums, constraints, indexes |
| `82d3e47` | Auth module: JWT access/refresh, refresh-token rotation/revocation, RolesGuard/JwtAuthGuard infrastructure |
| `6c2e667` | Users module: CRUD, Lead-gated management, soft-delete (`disabledAt`), wired into Auth's login/refresh/me checks |
| `3644735` | Alerts module: create/list/get/dismiss; dismissal audit fields (`dismissedById`/`dismissedAt`); case-linking explicitly deferred |
| `c2ee828` | Added this PROGRESS.md tracker |
| `86fbf4b` | Cases module: full lifecycle state machine, assignment/reassignment, escalation, alert-linking (creation-time and post-creation), visibility scoping — zero schema changes |
| `28aa8a7` | Investigations module: Hypothesis propose/validate/reject nested under a case; new `hypotheses` table + `hypothesis_status` enum; reuses Cases' visibility rule; Phase 1 begun per docs/ROADMAP.md's own sequencing |
| `8b29089` | Evidence module: text-based evidence create/list/get nested under a case, each writing a matching `evidence_added` timeline event; zero schema changes — the Milestone-1 foundation schema already had the complete `evidence` table |
| _(pending)_ | Timeline module: `GET /cases/:caseId/timeline` read-side API, paginated, deterministic order, author joined, reusing Cases' visibility rule; zero schema changes; closes Milestone 1 |
