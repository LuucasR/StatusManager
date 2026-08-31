-- The working calendar: a configurable weekly pattern plus dated exceptions.

-- Replaces the Monday-to-Friday check that used to be hardcoded in workday.ts.
ALTER TABLE "WorkdaySettings"
ADD COLUMN "workingWeekdays" INTEGER[] NOT NULL DEFAULT ARRAY[1, 2, 3, 4, 5];

-- Grace period between the end of the day and the "are you still working?"
-- prompt. Defaults to 0, which is exactly today's behaviour, so the automation
-- does not change on deploy - only once an admin sets it.
ALTER TABLE "WorkdaySettings"
ADD COLUMN "confirmationDelayMinutes" INTEGER NOT NULL DEFAULT 0;

-- Who answered the last check. Held in process memory until now, which meant a
-- restart inside the window lost the answer.
ALTER TABLE "Employee" ADD COLUMN "lastConfirmedAt" TIMESTAMP(3);

-- One row per dated deviation. The primary key is the DATE AS TEXT
-- ("YYYY-MM-DD" in the configured timezone), not a timestamp: a holiday is a
-- local calendar date, and stored as an instant it would land on the wrong day
-- depending on the offset. "ScheduledJobRun"."lastRunOn" already does this.
CREATE TABLE "WorkdayException" (
    "date"      TEXT NOT NULL,
    "working"   BOOLEAN NOT NULL,
    "startTime" TEXT,
    "endTime"   TEXT,
    "label"     TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkdayException_pkey" PRIMARY KEY ("date")
);
