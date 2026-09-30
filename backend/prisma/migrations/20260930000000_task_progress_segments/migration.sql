-- Real time a task spends in IN_PROGRESS: one segment per stretch in the
-- column, opened when the task enters it and closed when it leaves.
--
-- Additive only, like every task migration: the database is shared with the
-- running deployment.

-- CreateTable
CREATE TABLE "TaskProgressSegment" (
    "id" SERIAL NOT NULL,
    "taskId" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "TaskProgressSegment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskProgressSegment_taskId_idx" ON "TaskProgressSegment"("taskId");

-- AddForeignKey
ALTER TABLE "TaskProgressSegment" ADD CONSTRAINT "TaskProgressSegment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Tasks already in progress start counting now: there is no history before this.
INSERT INTO "TaskProgressSegment" ("taskId", "startedAt")
SELECT "id", CURRENT_TIMESTAMP FROM "Task" WHERE "state" = 'IN_PROGRESS';
