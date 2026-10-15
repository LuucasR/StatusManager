-- On its own file, like 20261013000001_account_notification_types: Postgres
-- does not allow USING an enum value in the same transaction that added it.

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'MAP_APPROVAL_REQUEST';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'MAP_APPROVED';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'MAP_REJECTED';
