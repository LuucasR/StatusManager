-- Explicit archive date: set by an admin when creating or editing a task, or
-- by restoring it from the archive. Null = the default, 14 days after endsAt.

-- AlterTable
ALTER TABLE "Task" ADD COLUMN "archiveAt" TIMESTAMP(3);
