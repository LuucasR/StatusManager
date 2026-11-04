-- Optional label per checklist item ("Cinematic", "UI"...). Items sharing one are
-- shown together in a box. Nullable for the same reason as the priority: existing
-- items, and items saved from clients built before this, simply have none.

-- AlterTable
ALTER TABLE "TaskChecklistItem" ADD COLUMN     "label" TEXT;
