-- A Working segment can now declare up to 3 checklist items instead of one.
-- The single checklistItemId/checklistItemText pair moves to its own table;
-- existing segments keep their item as the only (position 0) entry.

-- CreateTable
CREATE TABLE "ActivityChecklistItem" (
    "id" SERIAL NOT NULL,
    "activityId" INTEGER NOT NULL,
    "checklistItemId" INTEGER,
    "text" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "ActivityChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActivityChecklistItem_activityId_idx" ON "ActivityChecklistItem"("activityId");

-- CreateIndex
CREATE INDEX "ActivityChecklistItem_checklistItemId_idx" ON "ActivityChecklistItem"("checklistItemId");

-- AddForeignKey
ALTER TABLE "ActivityChecklistItem" ADD CONSTRAINT "ActivityChecklistItem_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "ActivityHistory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityChecklistItem" ADD CONSTRAINT "ActivityChecklistItem_checklistItemId_fkey" FOREIGN KEY ("checklistItemId") REFERENCES "TaskChecklistItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Copy the item every existing segment declared. A segment whose item was
-- deleted still has its text snapshot; one with neither had no item at all.
INSERT INTO "ActivityChecklistItem" ("activityId", "checklistItemId", "text", "position")
SELECT h."id", h."checklistItemId", COALESCE(h."checklistItemText", i."text", ''), 0
FROM "ActivityHistory" h
LEFT JOIN "TaskChecklistItem" i ON i."id" = h."checklistItemId"
WHERE h."checklistItemId" IS NOT NULL OR h."checklistItemText" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "ActivityHistory" DROP CONSTRAINT "ActivityHistory_checklistItemId_fkey";

-- DropIndex
DROP INDEX "ActivityHistory_checklistItemId_idx";

-- AlterTable
ALTER TABLE "ActivityHistory" DROP COLUMN "checklistItemId",
DROP COLUMN "checklistItemText";
