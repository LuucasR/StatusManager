-- Maps tab (on trial): map images and the sectors marked on them.

-- CreateTable
CREATE TABLE "SiteMap" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MapRegion" (
    "id" SERIAL NOT NULL,
    "mapId" INTEGER NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "w" DOUBLE PRECISION NOT NULL,
    "h" DOUBLE PRECISION NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "state" "TaskState" NOT NULL DEFAULT 'PENDING',
    "taskId" INTEGER,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MapRegion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MapRegionAssignee" (
    "regionId" INTEGER NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MapRegionAssignee_pkey" PRIMARY KEY ("regionId","employeeId")
);

-- CreateIndex
CREATE INDEX "MapRegion_mapId_idx" ON "MapRegion"("mapId");

-- CreateIndex
CREATE INDEX "MapRegionAssignee_employeeId_idx" ON "MapRegionAssignee"("employeeId");

-- AddForeignKey
ALTER TABLE "SiteMap" ADD CONSTRAINT "SiteMap_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MapRegion" ADD CONSTRAINT "MapRegion_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "SiteMap"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MapRegion" ADD CONSTRAINT "MapRegion_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MapRegion" ADD CONSTRAINT "MapRegion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MapRegionAssignee" ADD CONSTRAINT "MapRegionAssignee_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "MapRegion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MapRegionAssignee" ADD CONSTRAINT "MapRegionAssignee_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

