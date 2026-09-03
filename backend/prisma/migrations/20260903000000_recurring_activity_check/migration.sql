-- The activity check becomes recurrent instead of a single end-of-day event.

-- How often the question comes back while someone is still WORKING out of
-- hours. 30 minutes rather than 0-as-disabled: the master switch is already
-- "enabled", and a zero here would need a second meaning for "ask only once".
ALTER TABLE "WorkdaySettings"
ADD COLUMN "recheckIntervalMinutes" INTEGER NOT NULL DEFAULT 30;

-- When the app last asked THIS employee. Moving the deadline off the shared
-- per-day job run and onto the employee is what lets the check repeat, cross
-- midnight and survive a restart: both the interval and the answer timeout are
-- re-derivable from this column plus "lastConfirmedAt".
--
-- Left NULL for everyone, which reads as "never asked" and is due immediately -
-- correct, since nobody has been asked under the new rule yet.
ALTER TABLE "Employee" ADD COLUMN "lastPromptedAt" TIMESTAMP(3);

-- The per-day claim of the prompt job is gone: the recurring check owns all
-- prompting now and is idempotent through "lastPromptedAt" instead. Dropping
-- the row stops a stale one from being read as a real run.
DELETE FROM "ScheduledJobRun" WHERE "job" = 'workday-prompt';
