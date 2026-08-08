-- Conditional-field CHECK constraints from docs/ARCHITECTURE.md.

-- alerts.dismiss_reason: required when status = 'dismissed', otherwise must be null.
ALTER TABLE "alerts"
  ADD CONSTRAINT "alerts_dismiss_reason_status_check"
  CHECK (
    (status = 'dismissed' AND dismiss_reason IS NOT NULL)
    OR (status <> 'dismissed' AND dismiss_reason IS NULL)
  );

-- cases.resolution_summary: required when status = 'RESOLVED' (recommended constraint,
-- docs/ARCHITECTURE.md — one-directional, does not restrict resolution_summary in other states).
ALTER TABLE "cases"
  ADD CONSTRAINT "cases_resolution_summary_check"
  CHECK (status <> 'RESOLVED' OR resolution_summary IS NOT NULL);
