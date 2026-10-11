-- Admin approval for tasks created by non-admins, admin review of automatic
-- late warnings, and per-weekday working hours.
--
-- Additive only: every existing task stays APPROVED and every existing warning
-- stays ACTIVE, so the build still live while this is applied keeps working.

-- CreateEnum
CREATE TYPE "TaskApproval" AS ENUM ('APPROVED', 'PENDING', 'REJECTED');

-- CreateEnum
CREATE TYPE "WarningStatus" AS ENUM ('ACTIVE', 'PENDING', 'REJECTED');

-- AlterTable
ALTER TABLE "Task" ADD COLUMN "approval" "TaskApproval" NOT NULL DEFAULT 'APPROVED',
ADD COLUMN "reviewedById" INTEGER,
ADD COLUMN "reviewedAt" TIMESTAMP(3),
ADD COLUMN "rejectReason" TEXT;

-- CreateIndex
CREATE INDEX "Task_approval_idx" ON "Task"("approval");

-- AlterTable
ALTER TABLE "Warning" ADD COLUMN "status" "WarningStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN "adminComment" TEXT,
ADD COLUMN "reviewedById" INTEGER,
ADD COLUMN "reviewedByName" TEXT,
ADD COLUMN "reviewedAt" TIMESTAMP(3),
ADD COLUMN "reviewedLateMinutes" INTEGER;

-- AlterTable
ALTER TABLE "WorkdaySettings" ADD COLUMN "weekdaySchedule" JSONB;
