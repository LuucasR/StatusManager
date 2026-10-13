-- Tells a deactivated account apart from a sign-up waiting for approval:
-- both have active=false, only a deactivated one has this set.

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN "deactivatedAt" TIMESTAMP(3);
