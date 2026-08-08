# OpsFlow — Roadmap

This is a directional roadmap, not a schedule. Phases are meant to be built in order; later phases assume earlier ones are solid, not just present.

## Milestone 1 — manual investigation workspace

**Implement:**

- Authentication (NestJS Auth module, JWT-based)
- Authorization (Analyst / Lead roles, server-side role guards, case-visibility scoping — see docs/SECURITY.md)
- Users
- Alerts (manual entry, triage, dismissal, linking to a case)
- Cases, including the Alert/Case relationship (a case may contain multiple alerts, via `case_alerts`) and the explicit lifecycle state machine (docs/WORKFLOW.md), including escalation
- Append-only Timeline (Timeline Events) covering all of the above
- Text-based Evidence (type, source, content, timestamp, author, relationship to case)

**Domain model kept distinct, per current instructions:** User, Alert, Case, Timeline Event, Evidence. See docs/ARCHITECTURE.md for the concrete table-level schema (`users`, `alerts`, `cases`, `case_alerts`, `timeline_events`, `evidence`). No separate Incident entity — dropped entirely, not deferred under another name (see docs/PRODUCT.md). Hypotheses are confirmed as a **future** capability (see docs/PRODUCT.md's Investigation/Hypotheses chain) — no longer an open question about whether they're in scope; they are explicitly not Milestone 1.

**Do NOT implement in Milestone 1:**

- Investigation engine (the structured Case → Investigation → Hypotheses → Evidence → Validation → Conclusion process — see docs/PRODUCT.md)
- Hypotheses
- AI (backend module boundary reserved — see docs/ARCHITECTURE.md — but no AI code ships)
- Playbooks
- Knowledge base
- Binary file uploads (text-based evidence only)
- Infrastructure integrations (Kubernetes, Prometheus, Elasticsearch, Jira, Slack, and similar)
- Automated remediation
- Microservices of any kind
- Redis
- Kafka
- Message brokers (general)
- Event buses
- Comments/@mentions beyond basic case notes, search/filter, case export — these are Phase 1

## Phase 1 — Investigations module & collaboration

Introduce the **Investigations** module: implements the structured Investigation process from docs/PRODUCT.md — Hypotheses, Validation, and Conclusion, built inside an existing Case. This is not a revival of the earlier Incident-entity idea (see docs/PRODUCT.md's terminology note). Alongside it: comments/@mentions, search/filter across cases and alerts, case export (PDF/summary), richer metrics.

## Phase 2 — Playbooks & Knowledge

Introduce the **Playbooks** module (operational runbooks, a Lead capability) and the **Knowledge** module (operational knowledge base). Binary/file evidence with properly hardened storage (see docs/SECURITY.md) is also considered in this phase, as an enhancement to the existing Evidence module rather than a new one.

## Phase 3 — AI module

Introduce the **AI** module: backend-mediated summarization and next-step suggestions, in-process (not a separate microservice, per docs/ARCHITECTURE.md), gated on the provider/data-retention decision being made (see Open decisions below). Suggestions remain distinct from human-authored facts and evidence, always requiring explicit acceptance.

## Phase 4 — Integrations module

Introduce the **Integrations** module: inbound alert ingestion (SIEM/EDR push instead of manual entry, with deduplication) and outbound integrations (e.g., Jira, Slack). Each integration requires its own security review before design — not assumed safe by default. Automated remediation is not planned in any phase without a separate, explicit decision.

## Deliberately unscheduled

- Automated/SOAR-style remediation actions
- Multi-tenant SaaS
- Log search / data lake capability
- Microservices, Redis, Kafka, message brokers, event buses, Kubernetes, infrastructure orchestration, a separate AI microservice — no phase currently plans introducing any of this infrastructure; all require a concrete future requirement to justify them

## Open roadmap decisions

- **Investigation module design**: the Case → Investigation → Hypotheses → Evidence → Validation → Conclusion chain is named (docs/PRODUCT.md) but has no schema or module design yet — that's Phase 1 work.
- Primary key type (UUID vs. serial/bigint) across all Milestone 1 tables — not yet decided (see docs/ARCHITECTURE.md schema).
- Evidence `type` enum values — not finalized (see docs/ARCHITECTURE.md schema).
- Whether an Alert should ever be linkable to more than one Case — Milestone 1's `case_alerts` table is many-to-many-shaped but constrained to one case per alert by a unique index; revisit if a real need for many-to-many emerges.
- `VERIFYING → MITIGATING` loop-back — not in Milestone 1's state machine; revisit if real usage shows it's needed.
- Which AI provider/model, and its data-handling terms — must be settled before Phase 3 starts, not just before it ships.
- Exact scope of "basic metrics" — still loose.

**Resolved since the last review:** authentication mechanism (JWT, decided) and database access layer (Prisma, decided) — see docs/ARCHITECTURE.md.
