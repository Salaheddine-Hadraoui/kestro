# OpsFlow — Product

## Vision

OpsFlow is a professional SOC/operations investigation workspace. It gives security analysts a single place to receive alerts, manage the resulting work as structured cases, collect evidence, collaborate with teammates, and produce a defensible record of what happened and what was done about it.

OpsFlow is not a SIEM, not an EDR, and not a ticketing system. It sits on top of those systems: it ingests signals from them (or from manual entry), and turns raw alerts into investigated, documented, resolved cases.

## Target users

- **Analyst** — triages alerts, investigates cases assigned to them, adds evidence and notes, advances a case through its lifecycle.
- **Lead** — everything an Analyst can do, plus: sees every case regardless of assignment, escalates/reassigns cases, and (later) manages playbooks and operational knowledge.

A single person may hold the Lead role and still do Analyst-level work day to day; the roles are permission levels, not job titles.

## Problem statement

Analysts today juggle alerts across multiple tools (SIEM, EDR, ticketing, chat, spreadsheets) with no single record of "what did we investigate, what did we find, what did we do." Context is lost between shifts, evidence is scattered, and reporting after the fact is manual and slow.

## Domain terminology

OpsFlow's terminology chain is:

```
Alert → Case → Investigation → Resolution
```

- **Alert** — a detection/event originating from an external monitoring or operational source (a SIEM rule firing, an EDR detection, a manually-reported observation). An alert is a raw signal. Most alerts are noise: reviewed and dismissed without ever becoming anything more.
- **Case** — the operational workspace used to manage a production problem: its lifecycle state, its assignee, its evidence, its timeline. **A Case is the central object in OpsFlow.** A Case may contain multiple Alerts.
- **Investigation** — the structured process performed *inside* a Case to determine what happened, identify and validate possible causes, and reach a resolution. Investigation is a future domain capability, not a full module, in Milestone 1 (see below and docs/ROADMAP.md).
- **Resolution** — the outcome of a Case's lifecycle: the `RESOLVED` state plus its required resolution summary (see docs/WORKFLOW.md). Already part of Milestone 1's case lifecycle.
- **Timeline Event** — an append-only, attributed record of something that happened on a case (a note, a status change, evidence being added, a comment).
- **Evidence** — a text-based fact tied to a case, with a type, source, content, timestamp, and author.

**On "Investigation" vs. the earlier "Incident" idea:** these are not the same concept, and Investigation is not a renamed Incident. An earlier draft explored a separate *Incident* entity sitting between Alert and Case, representing "the operational problem" as distinct from "the workspace managing it." That entity has been dropped entirely — there is no Incident table, now or planned. Case itself is the single central object representing the problem being managed. Investigation, by contrast, is not an entity that would sit between Alert and Case — it's the *process* carried out inside an existing Case (see "Future: Investigation & Hypotheses" below). Do not conflate the two.

Concretely, for Milestone 1: one or more related alerts get linked by an analyst into one case, which accumulates evidence and timeline events until resolved. The structured "Investigation" process described below is not implemented yet — Milestone 1's investigation activity is just notes, evidence, and lifecycle transitions.

## Future: Investigation & Hypotheses (not Milestone 1)

A later phase formalizes investigation as its own structured capability, following this chain:

```
Case → Investigation → Hypotheses → Evidence → Validation → Conclusion
```

- An Analyst will eventually be able to **create hypotheses** within a Case's investigation (candidate explanations for what happened) and **evaluate** them against Evidence.
- Validating a hypothesis leads to a **Conclusion** — a human-confirmed statement of what actually happened, distinct from an unvalidated hypothesis.
- AI may eventually **suggest** hypotheses, but an AI suggestion must remain visibly and structurally distinct from a human-confirmed conclusion, permanently — the same acceptance-gate principle that applies to all AI output in OpsFlow (see docs/ARCHITECTURE.md, docs/SECURITY.md).

None of this — Hypotheses, Validation, Conclusion, or a full Investigation module — is implemented in Milestone 1. It is documented here so Milestone 1's Case/Evidence/Timeline design doesn't foreclose it later.

## Core value proposition

1. **Alert and Case as separate concepts** — noise (alerts) is not conflated with the work of managing the problem (the case). This keeps the case record clean and lets many alerts point at one case.
2. **Fast triage → case** — one or more related alerts can be turned into a case in one action, with context carried over.
3. **Structured evidence & timeline** — every finding and action is timestamped and attributed, append-only.
4. **AI-assisted drafting (future)** — AI will help summarize alerts and draft case narratives — always as a suggestion an analyst reviews and accepts, never as an autonomous action. Not built in Milestone 1; the architecture reserves a module boundary for it (see docs/ARCHITECTURE.md).
5. **Auditable by design** — every state change is logged with who/what/when, because SOC records are frequently reviewed after the fact (compliance, post-resolution review, legal).

## Core capabilities (product-level, not implementation)

- Alert intake (manual entry in Milestone 1; integration-fed later)
- Case creation, linking one or more alerts to a case
- Case lifecycle management with an explicit state machine (see docs/WORKFLOW.md)
- Evidence collection (text-based: type, source, content, timestamp, author, and its relationship to the case)
- Investigation timeline (chronological, append-only log of case activity)
- Collaboration (comments, assignment)
- AI assistance (future phase — summarization, next-step suggestions, narrative drafting, human-in-the-loop)
- Reporting (case summary export, basic metrics: open/closed, time-to-resolution)

## Roles and capabilities

### Analyst (Milestone 1)
- Create and investigate cases
- Add evidence
- Add investigation notes
- Update case state along permitted transitions (see docs/WORKFLOW.md)
- View cases they are assigned to
- *(Future, not Milestone 1)* Create and evaluate hypotheses — see "Future: Investigation & Hypotheses" above

### Lead (Milestone 1)
- All Analyst capabilities
- View and access all cases, regardless of assignment
- Escalate/reassign cases; accept escalations; reopen resolved cases
- *(Future, not Milestone 1)* Manage playbooks and operational knowledge

## Explicit non-goals (for now)

- Not a data lake / log search platform (no raw log ingestion or querying at scale)
- Not a SIEM correlation engine — OpsFlow consumes alerts, it does not generate detections
- Not a SOAR — no automated remediation actions against external systems
- Not multi-tenant SaaS in Milestone 1 — single organization per deployment initially
- No integrations with Kubernetes, Prometheus, Elasticsearch, RabbitMQ, Jira, or Slack in Milestone 1 — these are explicitly deferred, not designed yet
