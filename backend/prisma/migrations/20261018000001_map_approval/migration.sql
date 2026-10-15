-- Anyone uploads maps; a non-admin's waits for an admin's approval. Map
-- notifications link to their map, and a sector can have its own color.

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "mapId" INTEGER;

-- AlterTable
ALTER TABLE "SiteMap" ADD COLUMN     "approval" "TaskApproval" NOT NULL DEFAULT 'APPROVED',
ADD COLUMN     "rejectReason" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "MapRegion" ADD COLUMN     "color" TEXT;

-- CreateIndex
CREATE INDEX "SiteMap_approval_idx" ON "SiteMap"("approval");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "SiteMap"("id") ON DELETE SET NULL ON UPDATE CASCADE;
