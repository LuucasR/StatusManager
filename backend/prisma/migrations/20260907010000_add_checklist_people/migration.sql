-- Who is in charge of a checklist item, and who ticked it off.
--
-- Both FKs are SET NULL: deleting an account must not delete the item, nor the
-- record that the work was done. `doneByName` is the name snapshot that keeps
-- "done by" readable after the account is gone - the same reasoning as
-- Message.authorName. The assignment gets no snapshot on purpose: an assignment
-- to a deleted account is stale rather than historical, and reading back as
-- nobody being in charge is what makes somebody pick it up.
--
-- Additive with nullable columns, so the deployment that is running right now
-- keeps working until the new code ships.

-- AlterTable
ALTER TABLE "TaskChecklistItem" ADD COLUMN     "assigneeId" INTEGER,
ADD COLUMN     "doneById" INTEGER,
ADD COLUMN     "doneByName" TEXT;

-- CreateIndex
CREATE INDEX "TaskChecklistItem_assigneeId_idx" ON "TaskChecklistItem"("assigneeId");

-- AddForeignKey
ALTER TABLE "TaskChecklistItem" ADD CONSTRAINT "TaskChecklistItem_doneById_fkey" FOREIGN KEY ("doneById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskChecklistItem" ADD CONSTRAINT "TaskChecklistItem_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
