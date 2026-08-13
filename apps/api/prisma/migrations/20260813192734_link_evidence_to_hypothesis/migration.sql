-- AlterTable
ALTER TABLE "evidence" ADD COLUMN     "hypothesis_id" UUID;

-- CreateIndex
CREATE INDEX "evidence_hypothesis_id_idx" ON "evidence"("hypothesis_id");

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_hypothesis_id_fkey" FOREIGN KEY ("hypothesis_id") REFERENCES "hypotheses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
