-- An announcement can be switched off: it leaves the team's list and stays in
-- the admins' box. Existing ones stay on.

-- AlterTable
ALTER TABLE "Announcement" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true;
