-- Tasks and patch notes belong to a project, and announcements can expire.
-- Everything that exists today is Frommisfortunecomes, the only project so far.

-- The project, unless an admin already created it (any capitalisation).
INSERT INTO "Project" ("name", "updatedAt")
SELECT 'Frommisfortunecomes', CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Project" WHERE lower("name") = 'frommisfortunecomes');

-- Tasks
ALTER TABLE "Task" ADD COLUMN "projectId" INTEGER;
UPDATE "Task" SET "projectId" = (SELECT "id" FROM "Project" WHERE lower("name") = 'frommisfortunecomes' LIMIT 1);
ALTER TABLE "Task" ALTER COLUMN "projectId" SET NOT NULL;
CREATE INDEX "Task_projectId_idx" ON "Task"("projectId");
ALTER TABLE "Task" ADD CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Patch notes: the week and the version are now unique per project.
DROP INDEX "PatchWeek_weekStart_key";
DROP INDEX "PatchWeek_version_key";
ALTER TABLE "PatchWeek" ADD COLUMN "projectId" INTEGER;
UPDATE "PatchWeek" SET "projectId" = (SELECT "id" FROM "Project" WHERE lower("name") = 'frommisfortunecomes' LIMIT 1);
ALTER TABLE "PatchWeek" ALTER COLUMN "projectId" SET NOT NULL;
CREATE UNIQUE INDEX "PatchWeek_projectId_weekStart_key" ON "PatchWeek"("projectId", "weekStart");
CREATE UNIQUE INDEX "PatchWeek_projectId_version_key" ON "PatchWeek"("projectId", "version");
ALTER TABLE "PatchWeek" ADD CONSTRAINT "PatchWeek_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Announcements
ALTER TABLE "Announcement" ADD COLUMN "expiresAt" TIMESTAMP(3);
