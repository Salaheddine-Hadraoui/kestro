-- AlterTable
ALTER TABLE "alerts" ADD COLUMN     "dismissed_at" TIMESTAMP(3),
ADD COLUMN     "dismissed_by_id" UUID;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_dismissed_by_id_fkey" FOREIGN KEY ("dismissed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Replace the dismiss_reason-only CHECK with one covering all three
-- dismissal audit fields together (docs/SECURITY.md: who/what/when).
ALTER TABLE "alerts" DROP CONSTRAINT "alerts_dismiss_reason_status_check";

ALTER TABLE "alerts"
  ADD CONSTRAINT "alerts_dismissal_fields_status_check"
  CHECK (
    (
      status = 'dismissed'
      AND dismiss_reason IS NOT NULL
      AND dismissed_by_id IS NOT NULL
      AND dismissed_at IS NOT NULL
    )
    OR (
      status <> 'dismissed'
      AND dismiss_reason IS NULL
      AND dismissed_by_id IS NULL
      AND dismissed_at IS NULL
    )
  );
