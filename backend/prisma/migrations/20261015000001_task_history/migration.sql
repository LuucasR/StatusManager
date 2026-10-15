-- Task history: one row per thing that happened to a task (TaskEvent).

-- CreateTable
CREATE TABLE "TaskEvent" (
    "id" SERIAL NOT NULL,
    "taskId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "actorId" INTEGER,
    "actorName" TEXT,
    "targetId" INTEGER,
    "targetName" TEXT,
    "itemText" TEXT,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskEvent_taskId_createdAt_idx" ON "TaskEvent"("taskId", "createdAt");

-- AddForeignKey
ALTER TABLE "TaskEvent" ADD CONSTRAINT "TaskEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskEvent" ADD CONSTRAINT "TaskEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskEvent" ADD CONSTRAINT "TaskEvent_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Backfill from what the existing rows already record, so a task created before
-- the history existed does not open on an empty box. Who added somebody or put
-- them in charge was never stored: those rows have no actor.

INSERT INTO "TaskEvent" ("taskId", "type", "actorId", "actorName", "createdAt")
SELECT t."id", 'CREATED', t."createdById", e."name", t."createdAt"
FROM "Task" t LEFT JOIN "Employee" e ON e."id" = t."createdById";

INSERT INTO "TaskEvent" ("taskId", "type", "actorId", "actorName", "detail", "createdAt")
SELECT t."id", t."approval"::text, t."reviewedById", e."name", t."rejectReason", t."reviewedAt"
FROM "Task" t LEFT JOIN "Employee" e ON e."id" = t."reviewedById"
WHERE t."reviewedAt" IS NOT NULL AND t."approval" IN ('APPROVED', 'REJECTED');

INSERT INTO "TaskEvent" ("taskId", "type", "targetId", "targetName", "createdAt")
SELECT p."taskId", 'PARTICIPANT_ADDED', p."employeeId", e."name", p."addedAt"
FROM "TaskParticipant" p JOIN "Employee" e ON e."id" = p."employeeId";

INSERT INTO "TaskEvent" ("taskId", "type", "itemText", "createdAt")
SELECT i."taskId", 'ITEM_CREATED', i."text", i."createdAt"
FROM "TaskChecklistItem" i;

INSERT INTO "TaskEvent" ("taskId", "type", "targetId", "targetName", "itemText", "createdAt")
SELECT i."taskId", 'ITEM_ASSIGNED', a."employeeId", e."name", i."text", a."addedAt"
FROM "TaskChecklistAssignee" a
JOIN "TaskChecklistItem" i ON i."id" = a."itemId"
JOIN "Employee" e ON e."id" = a."employeeId";

INSERT INTO "TaskEvent" ("taskId", "type", "actorId", "actorName", "itemText", "createdAt")
SELECT i."taskId", 'ITEM_DONE', i."doneById", i."doneByName", i."text", i."doneAt"
FROM "TaskChecklistItem" i
WHERE i."done" = true AND i."doneAt" IS NOT NULL;
