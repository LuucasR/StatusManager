CREATE TYPE "PasswordChangeRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "PasswordChangeRequest" (
    "id" SERIAL NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "requestedPassword" TEXT NOT NULL,
    "status" "PasswordChangeRequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "PasswordChangeRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PasswordChangeRequest_status_createdAt_idx"
ON "PasswordChangeRequest"("status", "createdAt");

CREATE INDEX "PasswordChangeRequest_employeeId_status_idx"
ON "PasswordChangeRequest"("employeeId", "status");

ALTER TABLE "PasswordChangeRequest"
ADD CONSTRAINT "PasswordChangeRequest_employeeId_fkey"
FOREIGN KEY ("employeeId") REFERENCES "Employee"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
