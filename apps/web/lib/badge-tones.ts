import type { BadgeTone } from "@/components/ui/badge";
import type { AlertStatus, CaseStatus, Severity } from "./api/types";

// Shared semantic color mapping for severity and case lifecycle status.
// Kept in one place (rather than re-derived per page) so a future
// Alerts/Investigation/Evidence UI reuses the same severity scale instead of
// inventing its own -- CaseStatus's mapping is Case-specific, but Severity's
// is already shared with Alert (see lib/api/types.ts's Alert.severity).
export const SEVERITY_BADGE_TONE: Record<Severity, BadgeTone> = {
  low: "neutral",
  medium: "blue",
  high: "amber",
  critical: "red",
};

export const CASE_STATUS_BADGE_TONE: Record<CaseStatus, BadgeTone> = {
  OPEN: "neutral",
  TRIAGING: "blue",
  INVESTIGATING: "purple",
  ESCALATED: "red",
  MITIGATING: "amber",
  VERIFYING: "cyan",
  RESOLVED: "green",
};

// new = unactioned (matches CaseStatus.OPEN's neutral treatment); linked =
// successfully triaged into a case (a positive outcome, like RESOLVED);
// dismissed = closed without further action, given a color distinct from
// both so a scanning analyst can tell "still in my queue" (new) apart from
// either terminal outcome at a glance.
export const ALERT_STATUS_BADGE_TONE: Record<AlertStatus, BadgeTone> = {
  new: "neutral",
  linked: "green",
  dismissed: "purple",
};
