-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "pinned" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Task_pinned_endsAt_idx" ON "Task"("pinned", "endsAt");
