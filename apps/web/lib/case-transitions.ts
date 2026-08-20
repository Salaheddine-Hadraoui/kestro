import type { CaseAction, CaseStatus, UserRole } from "./api/types";

export interface CaseTransitionRule {
  action: CaseAction;
  from: CaseStatus;
  to: CaseStatus;
  roles: UserRole[];
  // Only "resolve" requires this -- rendered as a required field only for
  // that action's form (apps/api's TransitionCaseDto/CasesService enforce
  // the same requirement server-side; this is display-only).
  requiresResolutionSummary: boolean;
}

// Verbatim mirror of apps/api/src/cases/types/case-transitions.ts's
// CASE_TRANSITIONS table (one row per (action, from-status) pair --
// "escalate" appears twice, matching docs/WORKFLOW.md rows 3 and 4).
// Display-only: decides which action buttons render, never whether a
// mutation succeeds -- the backend re-validates every request against its
// own copy of this table regardless of what this file says.
export const CASE_TRANSITIONS: CaseTransitionRule[] = [
  {
    action: "begin_triage",
    from: "OPEN",
    to: "TRIAGING",
    roles: ["analyst", "lead"],
    requiresResolutionSummary: false,
  },
  {
    action: "start_investigation",
    from: "TRIAGING",
    to: "INVESTIGATING",
    roles: ["analyst", "lead"],
    requiresResolutionSummary: false,
  },
  {
    action: "escalate",
    from: "TRIAGING",
    to: "ESCALATED",
    roles: ["analyst", "lead"],
    requiresResolutionSummary: false,
  },
  {
    action: "escalate",
    from: "INVESTIGATING",
    to: "ESCALATED",
    roles: ["analyst", "lead"],
    requiresResolutionSummary: false,
  },
  {
    action: "accept_escalation",
    from: "ESCALATED",
    to: "INVESTIGATING",
    roles: ["lead"],
    requiresResolutionSummary: false,
  },
  {
    action: "begin_mitigation",
    from: "INVESTIGATING",
    to: "MITIGATING",
    roles: ["analyst", "lead"],
    requiresResolutionSummary: false,
  },
  {
    action: "begin_verification",
    from: "MITIGATING",
    to: "VERIFYING",
    roles: ["analyst", "lead"],
    requiresResolutionSummary: false,
  },
  {
    action: "resolve",
    from: "VERIFYING",
    to: "RESOLVED",
    roles: ["analyst", "lead"],
    requiresResolutionSummary: true,
  },
  {
    action: "reopen",
    from: "RESOLVED",
    to: "INVESTIGATING",
    roles: ["lead"],
    requiresResolutionSummary: false,
  },
];

export function getAvailableActions(
  status: CaseStatus,
  role: UserRole,
): CaseTransitionRule[] {
  return CASE_TRANSITIONS.filter((rule) => rule.from === status && rule.roles.includes(role));
}
