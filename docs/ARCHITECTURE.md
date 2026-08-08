# OpsFlow — Architecture

## Technology stack (final)

- **Frontend**: Next.js + TypeScript + Tailwind CSS
- **Backend**: NestJS + TypeScript
- **Data access layer**: Prisma (PostgreSQL ORM/client)
- **Database**: PostgreSQL
- **API**: REST (versioned, JSON)
- **Authentication**: JWT-based, behind the NestJS Auth module
- **Architecture**: modular monolith

No other infrastructure is introduced in the initial version. Specifically **not** used unless a future requirement explicitly justifies it: microservices, Redis, Kafka, message brokers, event buses, Kubernetes, infrastructure orchestration, or a separate AI microservice.

## Overview

OpsFlow is a **modular monolith**: one Next.js frontend, one NestJS backend, one PostgreSQL database accessed through Prisma. The backend is internally organized into clear domain modules, but ships and runs as a single deployable application. This matches the actual load (a handful of analysts, synchronous CRUD, occasional future AI call) without the operational overhead of splitting services, adding a broker, or standing up orchestration that nothing here currently needs.

```
Next.js frontend (TS, Tailwind)
   |  HTTPS / JSON (REST)
   v
NestJS backend — single deployable, internally modular
   |            \
   v             v
Prisma          AI provider (future — outbound HTTPS call only)
   |
   v
PostgreSQL
```

## Backend: modular monolith structure

The NestJS application is organized around domain modules (each a NestJS `Module` with its own controllers, services, and DTOs), not a generic pile of controllers. One process, one deployable, no inter-module network calls — modules depend on each other in-process, through NestJS's own dependency injection, the same way any two classes in the same application would.

**Current (Milestone 1) modules:**
- **Auth** — authentication and session/token issuance
- **Users** — user accounts, roles (Analyst/Lead)
- **Alerts** — alert intake, triage, dismissal, linking to cases
- **Cases** — case lifecycle state machine, assignment, escalation
- **Timeline** — the append-only timeline-event log; every other module writes through this, never around it
- **Evidence** — text-based evidence entries tied to a case

**Future modules (named, not implemented):**
- **Investigations** — implements the structured Investigation process described in docs/PRODUCT.md (Case → Investigation → Hypotheses → Evidence → Validation → Conclusion). This is **not** a revival of the earlier Incident-entity idea — there is no Incident table, planned or otherwise. It's the module that will eventually let an Analyst create/evaluate hypotheses and reach a validated conclusion inside a Case.
- **Playbooks** — operational runbooks (Lead capability, per docs/PRODUCT.md)
- **Knowledge** — operational knowledge base
- **AI** — backend-mediated AI suggestions (see AI layer, below)
- **Integrations** — inbound/outbound connections to external systems

None of the future modules are scaffolded or implemented yet. They are listed here only so the current module boundaries are drawn with them in mind (e.g., Evidence and Timeline are designed so a future Investigations or AI module could reference them later without restructuring).

## Frontend

- Next.js frontend, TypeScript throughout, Tailwind for styling.
- Talks to the backend exclusively via the versioned REST API — no direct DB access.
- Owns: case list/detail views, alert queue, timeline rendering, forms for notes/evidence, lifecycle transition controls (only showing transitions the current user's role permits — enforced again server-side).
- Holds no secrets: no AI provider keys, no direct third-party calls. Every outbound call this app needs goes through the NestJS backend.

## Backend responsibilities

- Authentication via JWT, issued and verified by the Auth module.
- Authorization — every request is checked server-side against the role/case-visibility rules in docs/SECURITY.md, via NestJS guards (role guards for Analyst/Lead). The frontend hiding a control is UX only.
- All business rules: the case state machine (docs/WORKFLOW.md) is enforced in the Cases module, not left to the client to obey.
- Persistence to PostgreSQL via Prisma.
- The append-only timeline: every module that changes case state writes a timeline event as part of the same request — enforced in application code (and reinforced at the DB level, see docs/SECURITY.md), never left to the caller to remember.
- The AI integration boundary (reserved, not implemented — see below).

## Database

- Single PostgreSQL database, accessed exclusively through Prisma from the NestJS backend.
- All writes that represent case activity also produce a timeline event — enforced by the backend, not client-driven.
- See "Milestone 1 database schema" below for the concrete table-level design.

## Milestone 1 database schema

This is the concrete schema for Milestone 1 only. It does not include any table or column for Investigation, Hypotheses, AI, Playbooks, Knowledge, or Integrations — those are out of scope (see docs/ROADMAP.md) and will require schema additions of their own when designed, not a reservation made now.

### `users`

| Column | Type | Required | Notes |
|---|---|---|---|
| id | PK | yes | type (UUID vs. serial) not yet decided |
| email | string | yes | unique |
| password_hash | string | yes | |
| name | string | yes | |
| role | enum(`analyst`, `lead`) | yes | |
| created_at | timestamp | yes | default now |
| updated_at | timestamp | yes | default now, updated on change |

### `alerts`

| Column | Type | Required | Notes |
|---|---|---|---|
| id | PK | yes | |
| source | string | yes | e.g. "manual", future: SIEM/EDR name |
| summary | string | yes | |
| raw_payload | jsonb | no | optional structured detail |
| severity | enum(`low`,`medium`,`high`,`critical`) | yes | |
| status | enum(`new`,`linked`,`dismissed`) | yes | default `new` |
| dismiss_reason | string | conditional | required when `status = dismissed`, otherwise must be null |
| created_at | timestamp | yes | default now |

No `case_id` column here — the Alert/Case relationship is many-to-many via `case_alerts` (below), not a direct foreign key on `alerts`.

### `cases`

| Column | Type | Required | Notes |
|---|---|---|---|
| id | PK | yes | |
| title | string | yes | |
| status | enum(`OPEN`,`TRIAGING`,`INVESTIGATING`,`ESCALATED`,`MITIGATING`,`VERIFYING`,`RESOLVED`) | yes | default `OPEN`; see docs/WORKFLOW.md for valid transitions |
| severity | enum(`low`,`medium`,`high`,`critical`) | yes | |
| assignee_id | FK → users.id | yes | |
| resolution_summary | string | conditional | required when `status = RESOLVED`, otherwise must be null |
| created_at | timestamp | yes | default now |
| updated_at | timestamp | yes | default now, updated on change |

Recommended constraint: a `CHECK` constraint enforcing `status <> 'RESOLVED' OR resolution_summary IS NOT NULL`.
Index: on `status`, and on `assignee_id` (case-visibility queries filter by both — see docs/SECURITY.md).

### `case_alerts` (join table)

| Column | Type | Required | Notes |
|---|---|---|---|
| id | PK | yes | |
| case_id | FK → cases.id | yes | |
| alert_id | FK → alerts.id | yes | |
| linked_at | timestamp | yes | default now |

Index: on `case_id` (listing a case's alerts) and a **unique** index on `alert_id` — this enforces the current business rule that an alert belongs to at most one case at a time (docs/WORKFLOW.md), even though the table shape is many-to-many. Whether an alert should ever be linkable to more than one case is an open decision (see docs/ROADMAP.md); until decided, the unique constraint keeps Milestone 1's behavior matching the documented workflow.

### `timeline_events`

| Column | Type | Required | Notes |
|---|---|---|---|
| id | PK | yes | |
| case_id | FK → cases.id | yes | |
| type | enum(`note`,`status_change`,`evidence_added`,`comment`,`alert_linked`) | yes | |
| author_id | FK → users.id | yes | |
| content | jsonb or text | yes | |
| created_at | timestamp | yes | default now |

No `updated_at`, no `deleted_at`, and no update/delete path anywhere — append-only by construction (see docs/SECURITY.md for the DB-grant-level enforcement).
Index: on `(case_id, created_at)` for chronological retrieval per case.

### `evidence`

| Column | Type | Required | Notes |
|---|---|---|---|
| id | PK | yes | |
| case_id | FK → cases.id | yes | |
| timeline_event_id | FK → timeline_events.id | yes | the event that introduced this evidence |
| type | string/enum | yes | exact enum values not finalized (e.g. `log`, `ioc`, `observation`, `reference`) — open decision |
| source | string | yes | |
| content | text | yes | |
| timestamp | timestamp | yes | when the observed fact occurred (distinct from `created_at`, when it was recorded) |
| author_id | FK → users.id | yes | |
| created_at | timestamp | yes | default now |

Index: on `case_id`, and on `timeline_event_id`.

## AI layer (reserved for a later phase — not built in Milestone 1)

Not a separate service or microservice. When built, it will be its own NestJS module (the future **AI** module above) that:

- takes case context assembled server-side,
- calls an external LLM provider over HTTPS (outbound only),
- returns a suggestion.

Design constraints to preserve from day one, even before this module exists:
- AI output is never written directly into case fields or evidence. It is stored as a distinct, attributed record (author = "AI", model/version recorded) that a human explicitly reviews and accepts — acceptance then creates a normal, human-attributed timeline event that references the suggestion. AI-generated content must remain visibly and structurally distinct from human-authored facts and evidence, permanently.
- The backend, never the frontend, holds AI provider credentials and constructs the context sent to it.
- AI is explicitly **not** a separate microservice — it is an in-process NestJS module like any other, consistent with the modular-monolith constraint.
- The Milestone 1 schema above does **not** reserve any column for this (`timeline_events.author_id` is a required, non-null foreign key to `users` — it has no room for an "AI" author). Storing AI suggestions will require new tables/columns designed when that module is actually built, not a reservation made today.

## Future infrastructure (explicitly deferred, not designed yet)

- Inbound integrations (SIEM/EDR webhooks) — would land in the future **Integrations** module as an authenticated ingestion endpoint. Does not require a message broker or queue at expected volumes.
- Outbound integrations (e.g., Jira, Slack) — deferred to the **Integrations** module; each would need its own authorization and audit story before being considered.
- Kubernetes, infrastructure orchestration, Redis, Kafka, message brokers, event buses — none planned or designed; explicitly out of scope until a concrete requirement justifies introducing that infrastructure at all.
- Multi-tenancy — deferred; Milestone 1 assumes one organization per deployment.

## Explicit boundaries

- **Frontend ↔ Backend**: versioned JSON REST API only. Frontend holds no secrets, makes no third-party calls, enforces no authorization decisions.
- **Backend ↔ AI (future)**: outbound-only, backend-initiated, backend-attributed, in-process module — not a separate service. AI never writes to the DB directly.
- **Backend ↔ future integrations**: any inbound integration is just another authenticated client of the API surface (or a narrow ingestion endpoint) handled by the future Integrations module, not a special internal path.
- **No infrastructure write access**: the application has no credentials or code path that write to production infrastructure (servers, containers, CI/CD, Kubernetes). OpsFlow is a business application that records investigations; it is not, and must not become, a tool that can change production infrastructure.
