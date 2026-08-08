# OpsFlow — Workflow

## Primary workflow: Alert → Case → Resolution

1. **Alert arrives** — created manually by an analyst, or (later) pushed by an integration. Has: source, severity, summary/raw payload, timestamp. Status starts as `new`.
2. **Triage** — an analyst reviews the alert queue and for each alert decides: dismiss (false positive/non-actionable, logged with a required reason), or link it to a case.
3. **Case creation** — linking an alert either:
   - creates a **new Case** in one action, pre-populated from the alert, or
   - links the alert to an **existing open case**, when it's recognized as more evidence of a problem already under investigation.
   A case can accumulate multiple linked alerts this way. A case can also be created without any alert (e.g., a report from another team).
4. **Investigation** — the assigned analyst, within the case:
   - adds **notes** (freeform findings)
   - adds **evidence** — type, source, content, timestamp, author; always tied to the case
   - advances the case through its **lifecycle state machine** (below) as understanding evolves
5. **Collaboration** — analysts can comment on a case. All of this is timeline activity.
6. **Escalation** — an analyst can escalate a case to a Lead at any point during triage or investigation when it needs Lead-level attention. A Lead accepts the escalation to resume investigation (see state machine).
7. **Resolution** — the case reaches `RESOLVED` with a required resolution summary (what happened, root cause, action taken). A Lead may reopen a resolved case if follow-up is needed.
8. **Closure & reporting** — a resolved case is the record for after-the-fact review. No separate reporting workflow exists yet; the case and its timeline are the report.

## Case lifecycle: state machine

States: `OPEN`, `TRIAGING`, `INVESTIGATING`, `ESCALATED`, `MITIGATING`, `VERIFYING`, `RESOLVED`.

Arbitrary transitions are not allowed. Only the transitions below are valid; any other request is rejected server-side regardless of role.

```
OPEN ──────────► TRIAGING ─────────► INVESTIGATING ─────────► MITIGATING ─────────► VERIFYING ─────────► RESOLVED
                    │                      │                                                                 │
                    │  escalate            │  escalate                                                       │  reopen
                    ▼                      ▼                                                                 │
                 ESCALATED ────────────────┘ (accept_escalation → INVESTIGATING)                             │
                                                                                                                │
                                                                             INVESTIGATING ◄───────────────────┘
```

| # | From | To | Action | Allowed roles |
|---|------|----|--------|----------------|
| 1 | OPEN | TRIAGING | `begin_triage` | Analyst, Lead |
| 2 | TRIAGING | INVESTIGATING | `start_investigation` | Analyst, Lead |
| 3 | TRIAGING | ESCALATED | `escalate` | Analyst, Lead |
| 4 | INVESTIGATING | ESCALATED | `escalate` | Analyst, Lead |
| 5 | ESCALATED | INVESTIGATING | `accept_escalation` | **Lead only** |
| 6 | INVESTIGATING | MITIGATING | `begin_mitigation` | Analyst, Lead |
| 7 | MITIGATING | VERIFYING | `begin_verification` | Analyst, Lead |
| 8 | VERIFYING | RESOLVED | `resolve` (requires a resolution summary) | Analyst, Lead |
| 9 | RESOLVED | INVESTIGATING | `reopen` | **Lead only** |

Notes:
- `escalate` does not require reassignment to happen atomically — a case can sit in `ESCALATED` unassigned or still assigned to the original analyst until a Lead runs `accept_escalation`, which also reassigns the case to that Lead.
- A verification failure that requires more mitigation (`VERIFYING → MITIGATING`) is not supported in Milestone 1. It's a plausible future addition, tracked as an open decision (see bottom of docs/ROADMAP.md) rather than built speculatively now.
- Reassigning a case's assignee without a Lead escalation (e.g., a Lead moving a case between two analysts) is an attribute change, not a lifecycle transition, and is a Lead-only action independent of state.

## Roles referenced in this workflow

See docs/PRODUCT.md for full role definitions. In short: an **Analyst** works the cases assigned to them through the forward lifecycle and can escalate; a **Lead** can additionally see every case, accept escalations, reassign, and reopen resolved cases.

## Secondary workflows

- **Shift handover** — a Lead (who sees all cases) or an Analyst (their own cases) views open/in-progress cases and their latest timeline entry to catch up before a shift change. No special "handover" object — a filtered view of existing case state.
- **Post-resolution review** — the resolved case + full timeline serves as the record for after-the-fact review.
- **Metrics review (Lead)** — aggregate counts (open/resolved, avg time-to-resolution) across all cases. Read-only, derived from existing data. Exact scope still to be pinned down (see docs/ROADMAP.md).

## What is explicitly out of scope for workflow in Milestone 1

- Automated alert ingestion from external systems (manual entry only)
- SLA timers / automated escalation
- Multi-step approval workflows for case resolution
- AI-assisted suggestions (architecture reserves space for this; not built yet — see docs/ARCHITECTURE.md)
- Binary file evidence (text-based evidence only; see docs/ROADMAP.md)
- Hypothesis creation/evaluation — a confirmed future capability (Case → Investigation → Hypotheses → Evidence → Validation → Conclusion, see docs/PRODUCT.md), not part of the Milestone 1 investigation flow described above
