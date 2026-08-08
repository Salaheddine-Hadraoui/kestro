# OpsFlow

A professional SOC/operations investigation workspace: turn incoming alerts into structured, evidence-backed, auditable cases.

## Stack

- Frontend: Next.js + TypeScript + Tailwind CSS
- Backend: NestJS + TypeScript, organized as a modular monolith
- Data access: Prisma
- Database: PostgreSQL
- API: REST (versioned, JSON)
- Auth: JWT, behind the NestJS Auth module

No microservices, Redis, Kafka, message brokers, event buses, Kubernetes, or infrastructure orchestration in the initial version — see `docs/ARCHITECTURE.md`.

## Status

Pre-implementation. Product, workflow, architecture, roadmap, and security docs exist under `docs/`; no application code has been written yet.

## Docs

- [`docs/PRODUCT.md`](docs/PRODUCT.md) — what OpsFlow is, who it's for, what it explicitly is not
- [`docs/WORKFLOW.md`](docs/WORKFLOW.md) — the alert → case → resolution workflow
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — system components and boundaries
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — phased scope
- [`docs/SECURITY.md`](docs/SECURITY.md) — security model and data sensitivity

## Getting started

Not yet applicable — no build/run instructions exist until Milestone 1 implementation begins.
