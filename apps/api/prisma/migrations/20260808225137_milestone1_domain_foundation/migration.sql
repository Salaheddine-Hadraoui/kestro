-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('analyst', 'lead');

-- CreateEnum
CREATE TYPE "severity" AS ENUM ('low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "alert_status" AS ENUM ('new', 'linked', 'dismissed');

-- CreateEnum
CREATE TYPE "case_status" AS ENUM ('OPEN', 'TRIAGING', 'INVESTIGATING', 'ESCALATED', 'MITIGATING', 'VERIFYING', 'RESOLVED');

-- CreateEnum
CREATE TYPE "timeline_event_type" AS ENUM ('note', 'status_change', 'evidence_added', 'comment', 'alert_linked');

-- CreateEnum
CREATE TYPE "evidence_type" AS ENUM ('LOG', 'SCREENSHOT', 'FILE', 'URL', 'COMMAND_OUTPUT', 'OTHER');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "user_role" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" UUID NOT NULL,
    "source" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "raw_payload" JSONB,
    "severity" "severity" NOT NULL,
    "status" "alert_status" NOT NULL DEFAULT 'new',
    "dismiss_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cases" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "status" "case_status" NOT NULL DEFAULT 'OPEN',
    "severity" "severity" NOT NULL,
    "assignee_id" UUID NOT NULL,
    "resolution_summary" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_alerts" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "alert_id" UUID NOT NULL,
    "linked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timeline_events" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "type" "timeline_event_type" NOT NULL,
    "author_id" UUID NOT NULL,
    "content" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "timeline_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "timeline_event_id" UUID NOT NULL,
    "type" "evidence_type" NOT NULL,
    "source" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "author_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "cases_status_idx" ON "cases"("status");

-- CreateIndex
CREATE INDEX "cases_assignee_id_idx" ON "cases"("assignee_id");

-- CreateIndex
CREATE UNIQUE INDEX "case_alerts_alert_id_key" ON "case_alerts"("alert_id");

-- CreateIndex
CREATE INDEX "case_alerts_case_id_idx" ON "case_alerts"("case_id");

-- CreateIndex
CREATE INDEX "timeline_events_case_id_created_at_idx" ON "timeline_events"("case_id", "created_at");

-- CreateIndex
CREATE INDEX "evidence_case_id_idx" ON "evidence"("case_id");

-- CreateIndex
CREATE INDEX "evidence_timeline_event_id_idx" ON "evidence"("timeline_event_id");

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_alerts" ADD CONSTRAINT "case_alerts_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_alerts" ADD CONSTRAINT "case_alerts_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "alerts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timeline_events" ADD CONSTRAINT "timeline_events_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timeline_events" ADD CONSTRAINT "timeline_events_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_timeline_event_id_fkey" FOREIGN KEY ("timeline_event_id") REFERENCES "timeline_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
