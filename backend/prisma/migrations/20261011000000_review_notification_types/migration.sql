-- On its own file, like 20260926000000_warning_notification_types: Postgres
-- does not allow USING an enum value in the same transaction that added it.

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'TASK_APPROVAL_REQUEST';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'TASK_APPROVED';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'TASK_REJECTED';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'LATE_WARNING_REVIEW';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'ANNOUNCEMENT';
