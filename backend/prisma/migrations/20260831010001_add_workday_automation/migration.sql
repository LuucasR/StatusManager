-- Marks a task the end-of-day job moved out of IN_PROGRESS, so the next working
-- morning knows which PENDING tasks to resume and which were never started.
ALTER TABLE "Task" ADD COLUMN "autoPausedAt" TIMESTAMP(3);

-- The resume job filters on exactly this: stamped AND still pending.
CREATE INDEX "Task_autoPausedAt_idx" ON "Task"("autoPausedAt");

-- Last working day each recurring job completed, so a restart across the
-- scheduled time still runs it, it never runs twice, and a second instance
-- cannot duplicate it.
CREATE TABLE "ScheduledJobRun" (
    "job" TEXT NOT NULL,
    "lastRunOn" TEXT NOT NULL,
    "ranAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduledJobRun_pkey" PRIMARY KEY ("job")
);

-- Single-row working-day configuration, editable by an admin.
CREATE TABLE "WorkdaySettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "startTime" TEXT NOT NULL DEFAULT '09:00',
    "endTime" TEXT NOT NULL DEFAULT '17:30',
    "timezone" TEXT NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',
    "confirmationTimeoutSeconds" INTEGER NOT NULL DEFAULT 120,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkdaySettings_pkey" PRIMARY KEY ("id")
);

-- Seed the single row so the app never has to cope with an empty table.
INSERT INTO "WorkdaySettings" ("id", "updatedAt") VALUES (1, CURRENT_TIMESTAMP);
