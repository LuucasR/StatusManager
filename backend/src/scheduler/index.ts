import { Prisma } from "@prisma/client";
import prisma from "../prisma/client";
import { logger } from "../logger";
import { runEndOfDay, runStartOfDay } from "./jobs";
import {
  getWorkdayConfig,
  isWorkingDay,
  parseTimeOfDay,
  zonedNow,
  type WorkdayConfig,
} from "./workday";

/**
 * Minute-resolution scheduler for the two working-day jobs.
 *
 * A polling loop rather than one timer per job on purpose. A `setTimeout` sized
 * to "the next 17:30" is wrong the moment the process restarts, the times are
 * edited by an admin, or a DST shift moves the target; re-deciding every minute
 * from the current wall clock makes all three non-events.
 *
 * The loop fires a job when the configured time has PASSED and the day has not
 * been claimed yet, not when the clock equals it exactly. That is what gives
 * catch-up: a deploy spanning 17:30 still runs the job at 17:34, instead of
 * silently skipping the day.
 */

const TICK_MS = 60_000;

type Job = {
  name: string;
  timeOf: (config: WorkdayConfig) => string;
  run: (config: WorkdayConfig) => Promise<void>;
};

/**
 * Order matters when several jobs are due at once, which happens after a long
 * outage: replaying start-then-end leaves the board paused, which is the correct
 * state for any moment after the end of the day.
 */
const JOBS: Job[] = [
  { name: "workday-start", timeOf: (c) => c.startTime, run: runStartOfDay },
  { name: "workday-end", timeOf: (c) => c.endTime, run: runEndOfDay },
];

/**
 * Claims `day` for `job`, returning true only for the caller that won it.
 *
 * The conditional UPDATE is the whole mechanism: `WHERE job = ? AND lastRunOn <>
 * ?` either matches one row or none, so two instances ticking at the same second
 * cannot both proceed, and a restart cannot replay a day already done.
 */
async function claimDay(job: string, day: string) {
  try {
    await prisma.scheduledJobRun.upsert({
      where: { job },
      // An empty marker never equals a real day, so a fresh row is always claimable.
      create: { job, lastRunOn: "" },
      update: {},
    });
  } catch (error) {
    // Two instances upserting the same missing row at the same instant: one
    // wins, the other gets a unique violation. The row now exists either way,
    // which is all this call was for, and the conditional UPDATE below still
    // decides which of them actually runs the job.
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== "P2002"
    ) {
      throw error;
    }
  }

  const claimed = await prisma.scheduledJobRun.updateMany({
    where: { job, lastRunOn: { not: day } },
    data: { lastRunOn: day, ranAt: new Date() },
  });

  return claimed.count === 1;
}

async function tick() {
  const config = await getWorkdayConfig();
  if (!config.enabled) return;

  const now = zonedNow(config.timezone);
  if (!isWorkingDay(now.weekday)) return;

  for (const job of JOBS) {
    const scheduled = parseTimeOfDay(job.timeOf(config));
    // A malformed time disables its own job rather than throwing every minute.
    // The admin routes validate the format, so this only guards hand-edited rows.
    if (scheduled === null) {
      logger.warn({ job: job.name }, "scheduled time is malformed, skipping");
      continue;
    }

    if (now.minutes < scheduled) continue;
    if (!(await claimDay(job.name, now.day))) continue;

    logger.info({ job: job.name, day: now.day }, "running scheduled job");
    try {
      await job.run(config);
    } catch (error) {
      // The day stays claimed on failure, deliberately: a job that half-ran must
      // not be retried a minute later on top of its own partial result.
      logger.error({ err: error, job: job.name }, "scheduled job failed");
    }
  }
}

let timer: NodeJS.Timeout | null = null;

export function startScheduler() {
  if (timer) return;

  // Runs once at boot too, so a restart right after a missed slot catches up
  // immediately instead of waiting for the next tick.
  void tick().catch((error) => logger.error({ err: error }, "scheduler tick failed"));

  timer = setInterval(() => {
    void tick().catch((error) => logger.error({ err: error }, "scheduler tick failed"));
  }, TICK_MS);

  logger.info({ tickMs: TICK_MS }, "workday scheduler started");
}

export function stopScheduler() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}
