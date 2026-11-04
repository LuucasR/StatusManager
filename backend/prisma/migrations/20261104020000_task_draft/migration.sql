-- Draft tasks: an admin can save a task without putting it on the board. Like a
-- PENDING one it is off the board, has no clock, no chat and tells nobody; unlike
-- one, only admins see it, and an admin activates it rather than approving it.
-- Only Task uses this value; SiteMap shares the enum but never sets it.

-- AlterEnum
ALTER TYPE "TaskApproval" ADD VALUE 'DRAFT';
