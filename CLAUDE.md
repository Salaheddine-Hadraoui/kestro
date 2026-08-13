# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

Kestro — a SOC Operations & Investigation Platform. Read `docs/PRODUCT.md`, `docs/WORKFLOW.md`, `docs/ARCHITECTURE.md`, and `docs/SECURITY.md` before making product or architecture decisions; they are the source of truth over assumptions.

## Status

Implementation is underway. docs/PROGRESS.md is the source of truth for exactly what's built, what's in progress, and project history — this file only covers standing instructions for how to work in this repo, and is not kept in sync with implementation status day to day.

## Stack (decided — do not deviate without asking)

- Frontend: Next.js + TypeScript + Tailwind CSS
- Backend: NestJS + TypeScript, as a modular monolith (domain modules under one deployable, not separate services)
- Data access: Prisma
- Database: PostgreSQL
- API: REST (versioned, JSON)
- Auth: JWT, behind the NestJS Auth module, with server-side role guards (Analyst/Lead)

Do not introduce microservices, Redis, Kafka, message brokers, event buses, Kubernetes, infrastructure orchestration, or a separate AI microservice unless a concrete later requirement justifies it — this is an explicit product decision, not an oversight to "fix."

## Backend module structure

Organize NestJS code around domain modules, not a generic pile of controllers. Current: Auth, Users, Alerts, Cases, Timeline, Evidence (Milestone 1), plus Investigations (Hypotheses — a scoped, implemented Phase 1 capability per docs/ROADMAP.md; see docs/PROGRESS.md for what it covers). Named but not implemented yet: Playbooks, Knowledge, AI, Integrations — do not scaffold these before they're actually scoped. The concrete Milestone 1 database schema (tables, fields, keys, indexes) is documented in docs/ARCHITECTURE.md.

## Working conventions

- This is a single-developer project. Prefer simple, boring, direct solutions over frameworks/abstractions that anticipate scale not yet needed (see docs/ARCHITECTURE.md).
- Terminology chain: Alert → Case → Investigation → Resolution. Case is the central object; Investigation is a process performed inside a Case (see docs/PROGRESS.md for what's implemented), not an entity between Alert and Case, and is **not** a renamed Incident — there is no Incident entity anywhere (see docs/PRODUCT.md).
- Milestone 1's domain model is User, Alert, Case, Timeline Event, Evidence — kept distinct, never collapsed. Investigations/Hypotheses (Case → Investigation → Hypotheses → Evidence → Validation → Conclusion, docs/PRODUCT.md) is a Phase 1 capability, already scoped and implemented (see docs/PROGRESS.md) — it is not part of canonical Milestone 1, but it is real and in the repo, not a future placeholder. Hypothesis↔Evidence linking specifically remains unbuilt and unscoped; don't add it without scoping first.
- The case lifecycle is a fixed state machine (docs/WORKFLOW.md). Never implement a generic/arbitrary status field or allow a transition not in that table, even if it seems convenient.
- Every case state change must produce a timeline event — this is a hard product requirement (docs/WORKFLOW.md, docs/SECURITY.md), not optional logging. The timeline is append-only: no update/delete path, ever.
- Case visibility is role-scoped: Analysts see their own assigned cases, Leads see all cases. Enforce server-side on every request (docs/SECURITY.md).
- AI-generated content is always a reviewable suggestion, never auto-applied to case state or auto-attributed as human-authored, and must stay distinct from human-confirmed conclusions (docs/SECURITY.md, docs/PRODUCT.md). Not implemented until the future AI module per docs/ROADMAP.md, and even then it's an in-process NestJS module, never a separate service.
- Beyond Milestone 1 plus the implemented Investigations/Hypotheses capability, the repo has none of: AI, Playbooks, Knowledge base, binary uploads, infrastructure integrations, automated remediation, microservices, Redis, Kafka, message brokers, event buses — see docs/ROADMAP.md for the exact list, and docs/PROGRESS.md for exactly what is and isn't built, before adding any of these.
- Treat all case/evidence content as sensitive: parameterize queries via Prisma (never raw SQL), encode output, validate strictly server-side with NestJS DTOs/pipes (docs/SECURITY.md).
- No secrets (DB credentials, future AI provider keys, etc.) in frontend code, logs, or committed to the repo. No production command execution or infrastructure write access from the application, ever.
