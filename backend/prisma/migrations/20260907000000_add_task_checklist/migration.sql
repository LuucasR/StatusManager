-- Checklist items for a task, plus the per-task switch that decides whether
-- ticking the last one moves the task to DONE on its own.
--
-- Both changes are ADDITIVE and carry defaults on purpose. The database is
-- shared with the running deployment, so between applying this and the new code
-- going live the old backend keeps working: every existing task simply reads
-- back an empty checklist and the switch off.
--
-- `position` is a plain column and NOT part of a unique index: reordering a list
-- would otherwise need a two-phase update to avoid colliding with itself
-- halfway through.

-- CreateTable
CREATE TABLE "TaskChecklistItem" (
    "id" SERIAL NOT NULL,
    "taskId" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "doneAt" TIMESTAMP(3),
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskChecklistItem_taskId_position_idx" ON "TaskChecklistItem"("taskId", "position");

-- AddForeignKey
ALTER TABLE "TaskChecklistItem" ADD CONSTRAINT "TaskChecklistItem_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "autoCompleteOnChecklist" BOOLEAN NOT NULL DEFAULT false;
