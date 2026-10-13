-- On its own file, like 20261011000000_review_notification_types: Postgres
-- does not allow USING an enum value in the same transaction that added it.

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'ACCOUNT_REQUEST';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'PASSWORD_RESET_REQUEST';
