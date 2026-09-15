-- Arrival times typed in by an admin, and the late-minute allowance per half of
-- the month they are judged against.

-- 25 minutes for each half by default: the 1st to the 15th, and the 16th to the
-- end of the month. Two columns rather than one so each half can differ.
ALTER TABLE "WorkdaySettings"
ADD COLUMN "lateToleranceFirstHalfMinutes" INTEGER NOT NULL DEFAULT 25,
ADD COLUMN "lateToleranceSecondHalfMinutes" INTEGER NOT NULL DEFAULT 25;

-- One row per employee per day. The date is text for the same reason
-- "WorkdayException"."date" is: it is a local calendar day, not an instant.
CREATE TABLE "AttendanceEntry" (
    "id" SERIAL NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "arrivedAt" TEXT NOT NULL,
    "expectedStart" TEXT NOT NULL,
    "lateMinutes" INTEGER NOT NULL,
    "note" TEXT,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AttendanceEntry_employeeId_date_key" ON "AttendanceEntry"("employeeId", "date");

CREATE INDEX "AttendanceEntry_date_idx" ON "AttendanceEntry"("date");

ALTER TABLE "AttendanceEntry" ADD CONSTRAINT "AttendanceEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AttendanceEntry" ADD CONSTRAINT "AttendanceEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
