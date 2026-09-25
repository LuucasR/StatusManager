-- Warnings: automatic ones for going over the half-month late allowance (one
-- per employee per half, via the unique key) and manual ones an admin grants.

CREATE TYPE "WarningSource" AS ENUM ('AUTO_LATE', 'MANUAL');

CREATE TABLE "Warning" (
    "id" SERIAL NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "source" "WarningSource" NOT NULL,
    "reason" TEXT NOT NULL,
    "month" TEXT,
    "half" INTEGER,
    "lateMinutes" INTEGER,
    "tolerance" INTEGER,
    "createdById" INTEGER,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedById" INTEGER,
    "revokedByName" TEXT,
    "revokeReason" TEXT,
    "revokedBySystem" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Warning_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Warning_employeeId_createdAt_idx" ON "Warning"("employeeId", "createdAt");

CREATE INDEX "Warning_createdAt_idx" ON "Warning"("createdAt");

CREATE UNIQUE INDEX "Warning_employeeId_month_half_key" ON "Warning"("employeeId", "month", "half");

ALTER TABLE "Warning" ADD CONSTRAINT "Warning_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Warning" ADD CONSTRAINT "Warning_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Warning" ADD CONSTRAINT "Warning_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Supabase exposes `public` through PostgREST with the anon key; RLS with no
-- policies locks anon out. Prisma connects as the table owner, which RLS does
-- not restrict (no FORCE). Same as every other table (_migration/01-enable-rls.sql).
ALTER TABLE "Warning" ENABLE ROW LEVEL SECURITY;
