import "dotenv/config";
import "../env";
import prisma from "../prisma/client";
import { isMonth } from "../attendance/attendance";
import { currentMonth, syncLateWarningsForMonth } from "./late-warning";

/**
 * One-off: evaluates a month's arrivals and creates (or revokes) the automatic
 * warnings, as if every arrival had just been saved. For the first deploy, when
 * the current half may already be over the allowance with no warning yet.
 *
 *   npm run warnings:backfill            # current month
 *   npm run warnings:backfill 2026-09
 *
 * It writes to whatever DATABASE_URL points at and notifies real people.
 */
async function main() {
  const month = process.argv[2] ?? (await currentMonth());
  if (!isMonth(month)) throw new Error(`Not a YYYY-MM month: ${month}`);

  // Actor 0 is the system, so every affected employee is notified.
  await syncLateWarningsForMonth(month, 0);

  const count = await prisma.warning.count({
    where: { source: "AUTO_LATE", month, revokedAt: null },
  });
  console.log(`${month}: ${count} active automatic warning(s)`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
