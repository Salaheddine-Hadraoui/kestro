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

A Milestone 1 readiness audit was then run against checkpoint `20d5894`
(read-only; findings only, no code changes). It found the core
implementation solid — schema, transactions, the case state machine, and
visibility scoping all matched the docs, with 177 tests passing — but
surfaced three must-fix process/completeness gaps and one confirmed
security bug. A **hardening pass** addressed all four (see "Milestone 1
hardening pass" below) before any further feature milestone begins.

## Current checkpoint

- Git: `20d5894` on `main` — Timeline read API; this is the checkpoint the
  readiness audit ran against and the hardening pass below was built on.
- Hardening pass (CLAUDE.md/PROGRESS.md reconciliation, `/v1` versioning,
  Notes/Comments, refresh-token rotation fix) implemented and verified on
  top of that; commit pending as of this writing (see "Chronological change
  history" below).

## Module status

| Module | Status | Notes |
|---|---|---|
| Foundation (DB schema) | Done | users, alerts, cases, case_alerts, timeline_events, evidence, hypotheses tables + enums, all UUID PK |
| Auth | Done | JWT access/refresh, refresh-token rotation + revocation, RolesGuard infra |
| Users | Done | CRUD, Lead-gated management, soft-delete (`disabledAt`) |
| Alerts | Done | create/list/get/dismiss; case-linking explicitly deferred (now resolved by Cases) |
| Cases | Done | full lifecycle state machine, assignment/reassignment, escalation, alert-linking (creation-time and post-creation), visibility scoping, freeform notes and comments (hardening pass). Zero schema changes beyond Milestone-1 foundation. |
| Investigations | Done | Hypothesis propose/validate/reject nested under a case, reusing Cases' visibility rule; one new table (`hypotheses`), zero changes to Case/Alert/User. |
| Evidence | Done | text-based evidence create/list/get nested under a case; each creation also writes the matching `evidence_added` timeline event (required by the pre-existing schema); zero schema changes — the Milestone-1 foundation already had the complete `evidence` table. |
| Timeline | Done | `GET /cases/:caseId/timeline`, read-only, nested under a case; reuses Cases' visibility check; paginated (`limit`/`offset`), deterministic chronological order, author joined in one query; zero schema changes — the Milestone-1 foundation's `timeline_events` table and existing indexes already supported this. |
| Playbooks, Knowledge, AI, Integrations | Not scoped | future phases per docs/ROADMAP.md — do not scaffold |

## Milestone 1 hardening pass

Run against checkpoint `20d5894`, in direct response to the readiness audit
run at that same checkpoint. Four required fixes, in scope order:

1. **CLAUDE.md / PROGRESS.md consistency** — CLAUDE.md still said Investigations/Hypotheses were "not implemented yet" and warned against scaffolding them, even though the Investigations module (see above) had already shipped. Updated CLAUDE.md's Status, module-structure, and domain-model sections to reflect that Investigations/Hypotheses is real and implemented (Phase 1), while keeping the still-genuinely-open item (Hypothesis↔Evidence linking) marked as unscoped. PROGRESS.md's own history was left as-is other than this entry and the checkpoint/next-milestone bookkeeping — it was already accurate, per the audit.
2. **API versioning** — `app.setGlobalPrefix('v1', { exclude: ['health'] })` added in `main.ts`. `/health` is excluded deliberately: it's a liveness probe (infrastructure plumbing), not a versioned business-API route. Every e2e test's bootstrap (which independently mirrors `main.ts`'s setup rather than importing it) got the same call, and every existing route assertion across all 8 e2e spec files was updated to the `/v1/...` path. No `/v2` or generic versioning framework introduced — a single static prefix is all today's requirement justifies.
3. **Notes/Comments** — implemented as two thin endpoints on the existing Cases module, `POST /cases/:id/notes` and `POST /cases/:id/comments`, each writing directly to `timeline_events` (`note` / `comment` types, both already reserved in the schema's `TimelineEventType` enum since Milestone 1 but never used until now). No new table: a note or comment has no fields beyond its content, so the existing append-only timeline architecture is the correct model as-is, per docs/WORKFLOW.md steps 4–5. Reuses the same visibility (`assertCanAccess`) and "resolved case rejects new activity" (409) rules already applied to evidence, alerts, and hypotheses. Because `note` is already overloaded for system-generated entries (`assignee_changed`, `hypothesis_*`), a human-authored note carries its own `event: 'note_added'` discriminator in `content`; `comment` has exactly one meaning so far and needs none.
4. **Refresh-token rotation race condition** — confirmed genuinely exploitable, not just theoretical: a regression test firing two concurrent `refresh()` calls with the same not-yet-revoked token showed both calls succeeding and minting two independent valid token pairs from a single-use token, under the pre-fix code. Fixed with the smallest sound change — replaced the unconditional `refreshToken.update(...)` revoke with the same atomic, conditional `updateMany({ where: { id, revokedAt: null } })` pattern `logout()` already used, rejecting with `UnauthorizedException` when the update affects zero rows. No change to token shapes, TTLs, or the overall auth flow.

**Verification**: `prisma validate` clean; `tsc --noEmit` clean; `eslint --fix` clean; unit tests 113/113 passing (was 104; +9 for the race regression test and the 8 new addNote/addComment cases); e2e tests 85/85 passing (was 73; +12 for Notes/Comments authorization/validation/resolved-case coverage, plus the existing cross-module timeline test extended to cover both new event types); `nest build` clean. Real-DB verification was done against the dedicated `kestro-postgres-dev` container (not just the Jest-mocked Prisma the rest of the suite uses): `prisma migrate status` confirmed no drift (this pass made no schema changes), then the compiled app was booted against it, exercised end-to-end over real HTTP (login, case creation, `/v1/cases/:id/notes`, `/v1/cases/:id/comments`, `GET /v1/cases/:id/timeline`, plus confirming `/health` still resolves unprefixed while `/v1/health` correctly 404s) with a throwaway user/case/timeline rows, then torn back down to leave the dev DB exactly as it was found. This also incidentally confirmed the `comment` enum value — reserved in the schema since Milestone 1 but never exercised by any code path until this pass — round-trips through real Postgres correctly.

**Findings not addressed in this pass**: per explicit scope instruction, the audit's "should fix soon" (B-tier) findings were deliberately left untouched and are recorded under "Known technical debt" below rather than fixed opportunistically.

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
- **API versioning is a single static `/v1` prefix** (`app.setGlobalPrefix('v1', { exclude: ['health'] })`), not Nest's built-in URI-versioning system — nothing today needs multiple simultaneously-served versions, so the simpler mechanism is the correct one; do not introduce `/v2` or a versioning framework without a concrete requirement.
- **Notes and comments have no dedicated table** — both are pure `timeline_events` rows (`note` / `comment` types) created via `POST /cases/:id/notes` and `POST /cases/:id/comments` on the existing Cases module, not a new module. A human-authored note's `content` carries an `event: 'note_added'` discriminator (the `note` type is already overloaded for system-generated entries); `comment` needed none, being new and single-purpose.
- **Refresh-token revocation is now conditional, not unconditional**: `refresh()`'s revoke step uses `updateMany({ where: { id, revokedAt: null } })` (same pattern as `logout()`) instead of a plain `update()`, so two concurrent requests racing the same not-yet-revoked token can't both succeed — closes a confirmed (regression-tested) race that let a single-use refresh token mint two valid sessions.

## Important decisions still pending

- **Alert creation has no actor field** (`createdById`) — docs/SECURITY.md's audit list names dismissal and linking, not creation, and docs/ARCHITECTURE.md's alerts table doesn't include one. Left as-is; worth confirming this is intentional rather than a doc oversight.
- **`VERIFYING → MITIGATING` loop-back** and **alert-linkable-to-multiple-cases** — both explicitly open in docs/ROADMAP.md, unaffected by anything built so far.
- **Hypothesis↔Evidence linking design** — explicitly re-confirmed as deferred (see decisions above); the exact shape (nullable FK vs. join table) isn't decided. This is the leading candidate for the next milestone (see below).
- **Phase 1's other named items** (@mentions, search/filter, case export, richer metrics — docs/ROADMAP.md) remain fully unscoped. Comments themselves are no longer on this list — see the hardening pass above.

## Current task

Milestone 1 hardening pass is complete and verified (see above); commit pending as of this writing. Not yet started: Hypothesis↔Evidence linking (see "Next planned milestone").

## Next planned milestone

**Hypothesis↔Evidence linking.** Both sides of this relationship now exist independently and are well-tested (Investigations and Evidence, both shipped in earlier milestones); this is the natural completion of docs/PRODUCT.md's `Investigation → Hypotheses → Evidence → Validation → Conclusion` chain, doesn't require scoping a brand-new module (unlike Playbooks/Knowledge/AI, all still explicitly unscoped per CLAUDE.md), and has been carried as an open decision across three prior milestone entries. Not started as of this writing.

## Known technical debt / limitations / follow-ups

- No pagination on `GET /users` (fine at current team-size assumptions per docs/PRODUCT.md; revisit if that changes) — also inconsistent with Cases/Timeline's `{data, total, limit, offset}` envelope; decide one way or the other before more list endpoints accumulate.
- No "logout all sessions" endpoint — refresh tokens revoke individually.
- No re-enable-only endpoint for users beyond `PATCH .../{disabled:false}`.
- `rawPayload` size limits on Alerts rely on Express's default body-parser cap; not explicitly configured.
- `CasesService.assertAlertsLinkable` validates alerts one at a time in a loop (N queries for N alertIds at case creation) rather than a single batched query — fine at Milestone-1 scale, worth revisiting if bulk alert-linking at creation becomes common.
- No Hypothesis↔Evidence linking (see "pending decisions" above; now the next planned milestone).
- No re-opening of a validated/rejected hypothesis if the conclusion later turns out wrong — would currently require proposing a fresh hypothesis instead.
- No evidence update/delete — intentional (append-only), but means a genuine data-entry mistake in evidence can only be superseded by new evidence, never corrected in place.
- `CasesService.reassign` doesn't call the shared `assertCanAccess` visibility check — harmless today since only Leads (who see every case) can reach it via `RolesGuard`, but it's an implicit invariant rather than an enforced one. From the readiness audit; deliberately not fixed in the hardening pass (scoped to the four required items only).
- No `ParseUUIDPipe` (or equivalent) on path params anywhere in the app — a malformed case/user/alert id reaches Postgres raw and the generic exception filter turns the resulting driver error into a 500 instead of a 400. From the readiness audit; deferred.
- Alert-linking has a TOCTOU: `assertAlertsLinkable` runs outside the write transaction, so a race between two concurrent link requests is only caught by the DB's unique constraint on `case_alerts.alert_id`, and the resulting `P2002` isn't mapped to a 409 — it surfaces as a 500. From the readiness audit; deferred.
- Timeline's append-only guarantee is enforced only in application code (no update/delete endpoints exist); docs/SECURITY.md's DB-grant-level backstop (revoking `UPDATE`/`DELETE` on `timeline_events` from the app's own DB role) was never added via migration. From the readiness audit; deferred.
- No CI pipeline and no enforced coverage threshold — all 198 tests pass locally as of this writing, but nothing gates a regression from merging. From the readiness audit; deferred.
- The "verify real DB behavior via manual psql smoke-testing" step (see Test strategy above) has no committed script or checklist — it's repeatable in principle but not in practice. This hardening pass's own real-DB verification (see above) was ad hoc for the same reason; turning it into a committed script is still outstanding. From the readiness audit; deferred.
- `.env.example` doesn't document `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `DATABASE_URL`, `CORS_ORIGIN`, or `PORT`, all of which `environment-variables.ts` actually requires at boot. From the readiness audit; deferred.
- No rate limiting on `/auth/login` — acceptable with no external/production exposure yet, but must land before any internet-facing deployment. From the readiness audit; deferred.

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
| `20d5894` | Timeline module: `GET /cases/:caseId/timeline` read-side API, paginated, deterministic order, author joined, reusing Cases' visibility rule; zero schema changes; closes Milestone 1 |
| _(pending)_ | Milestone 1 hardening pass: CLAUDE.md/PROGRESS.md reconciliation, `/v1` API versioning, Notes/Comments (`POST /cases/:id/notes`\|`/comments`), refresh-token rotation race fix — see "Milestone 1 hardening pass" above |
