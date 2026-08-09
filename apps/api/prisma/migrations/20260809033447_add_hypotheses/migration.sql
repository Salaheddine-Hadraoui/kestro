-- CreateEnum
CREATE TYPE "hypothesis_status" AS ENUM ('proposed', 'validated', 'rejected');

-- CreateTable
CREATE TABLE "hypotheses" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "statement" TEXT NOT NULL,
    "status" "hypothesis_status" NOT NULL DEFAULT 'proposed',
    "conclusion_statement" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hypotheses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hypotheses_case_id_idx" ON "hypotheses"("case_id");

-- AddForeignKey
ALTER TABLE "hypotheses" ADD CONSTRAINT "hypotheses_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hypotheses" ADD CONSTRAINT "hypotheses_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Mirrors the alerts_dismissal_fields_status_check / cases_resolution_summary_check
-- pattern: resolution fields are required together with the status they
-- correspond to, and forbidden otherwise.
ALTER TABLE "hypotheses"
  ADD CONSTRAINT "hypotheses_resolution_status_check"
  CHECK (
    (
      status = 'validated'
      AND conclusion_statement IS NOT NULL
      AND resolved_at IS NOT NULL
    )
    OR (
      status = 'rejected'
      AND conclusion_statement IS NULL
      AND resolved_at IS NOT NULL
    )
    OR (
      status = 'proposed'
      AND conclusion_statement IS NULL
      AND resolved_at IS NULL
    )
  );
