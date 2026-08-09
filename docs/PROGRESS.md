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

Milestone 1 (manual investigation workspace), in progress. Foundation, Auth,
Users, and Alerts are done. Cases is next.

## Current checkpoint

- Git: `3644735` on `main` (pushed to origin)
- Working tree: clean as of this writing

## Module status

| Module | Status | Notes |
|---|---|---|
| Foundation (DB schema) | Done | users, alerts, cases, case_alerts, timeline_events, evidence tables + enums, all UUID PK |
| Auth | Done | JWT access/refresh, refresh-token rotation + revocation, RolesGuard infra |
| Users | Done | CRUD, Lead-gated management, soft-delete (`disabledAt`) |
| Alerts | Done | create/list/get/dismiss; case-linking explicitly deferred |
| Cases | Not started | next milestone |
| Timeline | Not started | depends on Cases |
| Evidence | Not started | depends on Cases |
| Investigations, Playbooks, Knowledge, AI, Integrations | Not scoped | future phases per docs/ROADMAP.md — do not scaffold |

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

## Important decisions still pending

- **Case-linking transaction design** (Cases milestone): how "link alert to case" atomically creates/attaches a case, writes `case_alerts`, flips `alerts.status`, and writes the `alert_linked` timeline event — not yet designed.
- **API versioning**: docs/ARCHITECTURE.md says "REST (versioned, JSON)" but no version prefix exists on any route (`/auth/...`, `/users/...`, `/alerts/...`). Flagged twice now (Users, Alerts reports) as a pre-existing gap, not yet resolved.
- **Alert creation has no actor field** (`createdById`) — docs/SECURITY.md's audit list names dismissal and linking, not creation, and docs/ARCHITECTURE.md's alerts table doesn't include one. Left as-is; worth confirming this is intentional rather than a doc oversight.
- **`VERIFYING → MITIGATING` loop-back** and **alert-linkable-to-multiple-cases** — both explicitly open in docs/ROADMAP.md, unaffected by anything built so far.

## Current task

Cases module — not yet started. This document was created/updated as the prerequisite step before that work begins, per explicit instruction.

## Next planned milestone

**Cases module**: lifecycle state machine (docs/WORKFLOW.md's 7-state machine with named transitions), assignment, escalation, and the Alert→Case linking transaction. Timeline and Evidence modules depend on Cases existing first (both FK to `cases`).

## Known technical debt / limitations / follow-ups

- No pagination on `GET /users` (fine at current team-size assumptions per docs/PRODUCT.md; revisit if that changes).
- No "logout all sessions" endpoint — refresh tokens revoke individually.
- No re-enable-only endpoint for users beyond `PATCH .../{disabled:false}`.
- `rawPayload` size limits on Alerts rely on Express's default body-parser cap; not explicitly configured.
- No API version prefix (see "pending decisions" above).

## Chronological change history

| Commit | Change |
|---|---|
| `a7efc96` | Initial OpsFlow foundation scaffold |
| `a006f5f` | Renamed project to Kestro |
| `997e76a` | Milestone 1 domain schema: users, alerts, cases, case_alerts, timeline_events, evidence — models, enums, constraints, indexes |
| `82d3e47` | Auth module: JWT access/refresh, refresh-token rotation/revocation, RolesGuard/JwtAuthGuard infrastructure |
| `6c2e667` | Users module: CRUD, Lead-gated management, soft-delete (`disabledAt`), wired into Auth's login/refresh/me checks |
| `3644735` | Alerts module: create/list/get/dismiss; dismissal audit fields (`dismissedById`/`dismissedAt`); case-linking explicitly deferred |
