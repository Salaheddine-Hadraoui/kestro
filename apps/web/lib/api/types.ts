export type UserRole = "analyst" | "lead";

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  disabledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface ApiErrorBody {
  statusCode: number;
  message: string | string[];
  timestamp?: string;
  path?: string;
}

export type Severity = "low" | "medium" | "high" | "critical";

export type CaseStatus =
  | "OPEN"
  | "TRIAGING"
  | "INVESTIGATING"
  | "ESCALATED"
  | "MITIGATING"
  | "VERIFYING"
  | "RESOLVED";

// Mirrors apps/api/src/cases/types/case-transitions.ts's CaseAction enum
// values exactly. Display-only on this side -- the backend is the sole
// enforcement point for every one of these actions.
export type CaseAction =
  | "begin_triage"
  | "start_investigation"
  | "escalate"
  | "accept_escalation"
  | "begin_mitigation"
  | "begin_verification"
  | "resolve"
  | "reopen";

export interface Case {
  id: string;
  title: string;
  status: CaseStatus;
  severity: Severity;
  assigneeId: string;
  resolutionSummary: string | null;
  createdAt: string;
  updatedAt: string;
}

export type AlertStatus = "new" | "linked" | "dismissed";

// Read-only display shape for a case's linked alerts. Alerts UI itself is
// out of scope for this milestone -- this is only what apps/api's
// CaseWithAlerts type already returns alongside a case.
export interface Alert {
  id: string;
  source: string;
  summary: string;
  severity: Severity;
  status: AlertStatus;
  dismissReason: string | null;
  createdAt: string;
}

export interface CaseWithAlerts extends Case {
  alerts: Alert[];
}

export interface PaginatedCases {
  data: Case[];
  total: number;
  limit: number;
  offset: number;
}

export type TimelineEventType =
  | "note"
  | "status_change"
  | "evidence_added"
  | "comment"
  | "alert_linked";

// Only GET /cases/:caseId/timeline joins the author -- the write endpoints
// (POST .../notes, POST .../comments) return an unjoined TimelineEvent, but
// this milestone only ever reads notes/comments back through the Timeline
// endpoint, so this is the only shape this app needs.
export interface TimelineEventWithAuthor {
  id: string;
  caseId: string;
  type: TimelineEventType;
  authorId: string;
  content: Record<string, unknown>;
  createdAt: string;
  author: { id: string; name: string; role: UserRole };
}

export interface PaginatedTimelineEvents {
  data: TimelineEventWithAuthor[];
  total: number;
  limit: number;
  offset: number;
}
