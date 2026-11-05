-- The checklist item being worked on, declared alongside the task when switching
-- to Working. Nullable: older segments, work without a task and tasks without a
-- checklist simply have none. SetNull + text snapshot, same as taskId/taskTitle.

-- AlterTable
ALTER TABLE "ActivityHistory" ADD COLUMN     "checklistItemId" INTEGER,
ADD COLUMN     "checklistItemText" TEXT;

-- CreateIndex
CREATE INDEX "ActivityHistory_checklistItemId_idx" ON "ActivityHistory"("checklistItemId");

-- AddForeignKey
ALTER TABLE "ActivityHistory" ADD CONSTRAINT "ActivityHistory_checklistItemId_fkey" FOREIGN KEY ("checklistItemId") REFERENCES "TaskChecklistItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
