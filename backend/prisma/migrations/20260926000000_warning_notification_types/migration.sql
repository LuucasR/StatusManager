-- On its own file, like 20260831010000_add_workday_enums: Postgres does not
-- allow USING an enum value in the same transaction that added it (55P04).

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'LATE_WARNING';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'WARNING_GRANTED';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'WARNING_REVOKED';
