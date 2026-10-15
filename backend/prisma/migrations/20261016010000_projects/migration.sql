-- Projects: maps now belong to one, and each project gets its own tab.

-- CreateTable
CREATE TABLE "Project" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Project_name_key" ON "Project"("name");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Maps uploaded while the tab was on trial, before projects existed, go to a
-- project of their own instead of being lost.
ALTER TABLE "SiteMap" ADD COLUMN "projectId" INTEGER;

INSERT INTO "Project" ("name", "updatedAt")
SELECT 'Maps', CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM "SiteMap");

UPDATE "SiteMap" SET "projectId" = (SELECT MIN("id") FROM "Project") WHERE "projectId" IS NULL;

ALTER TABLE "SiteMap" ALTER COLUMN "projectId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "SiteMap_projectId_idx" ON "SiteMap"("projectId");

-- AddForeignKey
ALTER TABLE "SiteMap" ADD CONSTRAINT "SiteMap_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
