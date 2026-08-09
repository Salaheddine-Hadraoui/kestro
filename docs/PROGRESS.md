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

## Current checkpoint

- Git: `86fbf4b` on `main` (pushed to origin) — Cases module.
- Investigations module implemented and verified on top of that; commit
  pending as of this writing (see below).

## Module status

| Module | Status | Notes |
|---|---|---|
| Foundation (DB schema) | Done | users, alerts, cases, case_alerts, timeline_events, evidence, hypotheses tables + enums, all UUID PK |
| Auth | Done | JWT access/refresh, refresh-token rotation + revocation, RolesGuard infra |
| Users | Done | CRUD, Lead-gated management, soft-delete (`disabledAt`) |
| Alerts | Done | create/list/get/dismiss; case-linking explicitly deferred (now resolved by Cases) |
| Cases | Done | full lifecycle state machine, assignment/reassignment, escalation, alert-linking (creation-time and post-creation), visibility scoping. Zero schema changes beyond Milestone-1 foundation. |
| Investigations | Done | Hypothesis propose/validate/reject nested under a case, reusing Cases' visibility rule; one new table (`hypotheses`), zero changes to Case/Alert/User. |
| Timeline | Partially exists | `timeline_events` is written by Cases and Investigations — no dedicated Timeline module/read-API exists yet (e.g. no `GET /cases/:id/timeline`). |
| Evidence | Not started | schema exists (case_id + timeline_event_id), no write API yet; Hypothesis↔Evidence linking (docs/PRODUCT.md's "evaluate against Evidence") deferred until this exists |
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

## Important decisions still pending

- **API versioning**: docs/ARCHITECTURE.md says "REST (versioned, JSON)" but no version prefix exists on any route. Flagged four times now as a pre-existing gap, not yet resolved.
- **Alert creation has no actor field** (`createdById`) — docs/SECURITY.md's audit list names dismissal and linking, not creation, and docs/ARCHITECTURE.md's alerts table doesn't include one. Left as-is; worth confirming this is intentional rather than a doc oversight.
- **No dedicated Timeline read-API yet** — `timeline_events` rows exist and are being written correctly by Cases and Investigations, but there's no `GET /cases/:id/timeline` (or similar) endpoint to read them back.
- **`VERIFYING → MITIGATING` loop-back** and **alert-linkable-to-multiple-cases** — both explicitly open in docs/ROADMAP.md, unaffected by anything built so far.
- **Hypothesis↔Evidence linking design** — deferred until the Evidence module exists; the exact shape (join table? optional FK on evidence?) isn't decided yet.
- **Phase 1's other named items** (comments/@mentions, search/filter, case export, richer metrics — docs/ROADMAP.md) are not part of this Investigations work and remain fully unscoped.

## Current task

Investigations module implementation is complete and verified (see below); commit pending as of this writing.

## Next planned milestone

**Evidence module**: text-based evidence entries tied to a case + timeline event, per docs/ARCHITECTURE.md's schema (already exists, unused). Once it exists, revisit Hypothesis↔Evidence linking. **Timeline module** (read-side) is the other clear next step — expose `timeline_events` via an API respecting the same case-visibility rules.

## Known technical debt / limitations / follow-ups

- No pagination on `GET /users` (fine at current team-size assumptions per docs/PRODUCT.md; revisit if that changes).
- No "logout all sessions" endpoint — refresh tokens revoke individually.
- No re-enable-only endpoint for users beyond `PATCH .../{disabled:false}`.
- `rawPayload` size limits on Alerts rely on Express's default body-parser cap; not explicitly configured.
- No API version prefix (see "pending decisions" above).
- No Timeline read-API (see "pending decisions" above) — the data exists, the endpoint doesn't.
- `CasesService.assertAlertsLinkable` validates alerts one at a time in a loop (N queries for N alertIds at case creation) rather than a single batched query — fine at Milestone-1 scale, worth revisiting if bulk alert-linking at creation becomes common.
- No Hypothesis↔Evidence linking (see "pending decisions" above).
- No re-opening of a validated/rejected hypothesis if the conclusion later turns out wrong — would currently require proposing a fresh hypothesis instead.

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
| _(pending)_ | Investigations module: Hypothesis propose/validate/reject nested under a case; new `hypotheses` table + `hypothesis_status` enum; reuses Cases' visibility rule; Phase 1 begun per docs/ROADMAP.md's own sequencing |
