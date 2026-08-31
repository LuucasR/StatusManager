-- On its own file: Postgres does not allow USING an enum value in the same
-- transaction that added it (55P04), and Prisma wraps every migration in one.
-- Same reasoning as the SUPERVISOR and TASK_MANAGER migrations.

-- AlterEnum
ALTER TYPE "ActivityStatus" ADD VALUE 'AUTO_DISCONNECTED';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'ACTIVITY_NO_RESPONSE';
