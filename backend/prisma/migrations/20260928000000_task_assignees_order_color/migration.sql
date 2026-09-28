-- Several people in charge of one checklist item, manual card order on the
-- board, and an admin colour flag on tasks.
--
-- Additive only, like every task migration: the database is shared with the
-- running deployment, and the build still live while this is applied keeps
-- reading and writing TaskChecklistItem.assigneeId, which is left in place and
-- dropped by a later migration.

-- CreateTable
CREATE TABLE "TaskChecklistAssignee" (
    "itemId" INTEGER NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskChecklistAssignee_pkey" PRIMARY KEY ("itemId","employeeId")
);

-- CreateIndex
CREATE INDEX "TaskChecklistAssignee_employeeId_idx" ON "TaskChecklistAssignee"("employeeId");

-- AddForeignKey
ALTER TABLE "TaskChecklistAssignee" ADD CONSTRAINT "TaskChecklistAssignee_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "TaskChecklistItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskChecklistAssignee" ADD CONSTRAINT "TaskChecklistAssignee_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every existing single assignee becomes the item's first assignee.
INSERT INTO "TaskChecklistAssignee" ("itemId", "employeeId")
SELECT "id", "assigneeId" FROM "TaskChecklistItem" WHERE "assigneeId" IS NOT NULL
ON CONFLICT DO NOTHING;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN "boardPosition" INTEGER,
ADD COLUMN "color" TEXT;
