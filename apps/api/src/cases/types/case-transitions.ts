import { CaseStatus, UserRole } from '../../../generated/prisma/client';

// Named actions from docs/WORKFLOW.md's case lifecycle state machine. Kept
// as an explicit closed set — never a free-form status field — per
// CLAUDE.md ("never allow a transition not in that table").
export enum CaseAction {
  begin_triage = 'begin_triage',
  start_investigation = 'start_investigation',
  escalate = 'escalate',
  accept_escalation = 'accept_escalation',
  begin_mitigation = 'begin_mitigation',
  begin_verification = 'begin_verification',
  resolve = 'resolve',
  reopen = 'reopen',
}

export interface CaseTransitionRule {
  action: CaseAction;
  from: CaseStatus;
  to: CaseStatus;
  roles: UserRole[];
}

// One row per (action, from-status) pair — "escalate" appears twice because
// it's valid from two different states (docs/WORKFLOW.md rows 3 and 4).
export const CASE_TRANSITIONS: CaseTransitionRule[] = [
  {
    action: CaseAction.begin_triage,
    from: CaseStatus.OPEN,
    to: CaseStatus.TRIAGING,
    roles: [UserRole.analyst, UserRole.lead],
  },
  {
    action: CaseAction.start_investigation,
    from: CaseStatus.TRIAGING,
    to: CaseStatus.INVESTIGATING,
    roles: [UserRole.analyst, UserRole.lead],
  },
  {
    action: CaseAction.escalate,
    from: CaseStatus.TRIAGING,
    to: CaseStatus.ESCALATED,
    roles: [UserRole.analyst, UserRole.lead],
  },
  {
    action: CaseAction.escalate,
    from: CaseStatus.INVESTIGATING,
    to: CaseStatus.ESCALATED,
    roles: [UserRole.analyst, UserRole.lead],
  },
  {
    action: CaseAction.accept_escalation,
    from: CaseStatus.ESCALATED,
    to: CaseStatus.INVESTIGATING,
    roles: [UserRole.lead],
  },
  {
    action: CaseAction.begin_mitigation,
    from: CaseStatus.INVESTIGATING,
    to: CaseStatus.MITIGATING,
    roles: [UserRole.analyst, UserRole.lead],
  },
  {
    action: CaseAction.begin_verification,
    from: CaseStatus.MITIGATING,
    to: CaseStatus.VERIFYING,
    roles: [UserRole.analyst, UserRole.lead],
  },
  {
    action: CaseAction.resolve,
    from: CaseStatus.VERIFYING,
    to: CaseStatus.RESOLVED,
    roles: [UserRole.analyst, UserRole.lead],
  },
  {
    action: CaseAction.reopen,
    from: CaseStatus.RESOLVED,
    to: CaseStatus.INVESTIGATING,
    roles: [UserRole.lead],
  },
];

export function findTransitionRule(
  action: CaseAction,
  from: CaseStatus,
): CaseTransitionRule | undefined {
  return CASE_TRANSITIONS.find((r) => r.action === action && r.from === from);
}
