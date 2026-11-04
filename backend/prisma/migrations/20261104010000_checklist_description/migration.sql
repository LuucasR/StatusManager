-- Optional longer description per checklist item, shown in a popup when the item
-- is clicked. Nullable like the label: existing items, and items saved from
-- clients built before this, simply have none.

-- AlterTable
ALTER TABLE "TaskChecklistItem" ADD COLUMN     "description" TEXT;
