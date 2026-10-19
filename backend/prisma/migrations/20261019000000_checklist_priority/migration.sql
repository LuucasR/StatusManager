-- Priority per checklist item. Nullable: existing items, and items from clients
-- built before this (the Android app ships its bundle), simply have none.

-- CreateEnum
CREATE TYPE "ChecklistPriority" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- AlterTable
ALTER TABLE "TaskChecklistItem" ADD COLUMN     "priority" "ChecklistPriority";
