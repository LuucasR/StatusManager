-- Weekly patch notes: one row per week, one row per entry each person writes.

CREATE TYPE "PatchWeekStatus" AS ENUM ('DRAFT', 'CLOSED', 'PUBLISHED');

CREATE TYPE "PatchCategory" AS ENUM ('FEATURE', 'FIX', 'BALANCE', 'ART', 'AUDIO', 'UI', 'PERFORMANCE', 'CONTENT', 'OTHER');

CREATE TABLE "PatchWeek" (
    "id" SERIAL NOT NULL,
    "weekStart" TEXT NOT NULL,
    "version" TEXT,
    "title" TEXT,
    "summary" TEXT NOT NULL DEFAULT '',
    "status" "PatchWeekStatus" NOT NULL DEFAULT 'DRAFT',
    "closedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "publishedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatchWeek_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PatchEntry" (
    "id" SERIAL NOT NULL,
    "weekId" INTEGER NOT NULL,
    "authorId" INTEGER,
    "authorName" TEXT NOT NULL,
    "taskId" INTEGER,
    "taskTitle" TEXT,
    "category" "PatchCategory" NOT NULL,
    "body" TEXT NOT NULL,
    "internal" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatchEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PatchWeek_weekStart_key" ON "PatchWeek"("weekStart");

CREATE UNIQUE INDEX "PatchWeek_version_key" ON "PatchWeek"("version");

CREATE INDEX "PatchEntry_weekId_authorId_idx" ON "PatchEntry"("weekId", "authorId");

CREATE INDEX "PatchEntry_taskId_idx" ON "PatchEntry"("taskId");

ALTER TABLE "PatchWeek" ADD CONSTRAINT "PatchWeek_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PatchEntry" ADD CONSTRAINT "PatchEntry_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "PatchWeek"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PatchEntry" ADD CONSTRAINT "PatchEntry_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PatchEntry" ADD CONSTRAINT "PatchEntry_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
