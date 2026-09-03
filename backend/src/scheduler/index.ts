import { Prisma } from "@prisma/client";
import prisma from "../prisma/client";
import { logger } from "../logger";
import { runActivityCheck, runClose, runStartOfDay } from "./jobs";
import {
  closeMinutes,
  getWorkdayConfig,
  getWorkdayException,
  resolveWorkday,
  zonedNow,
  type ResolvedDay,
  type WorkdayConfig,
} from "./workday";

/**
 * Minute-resolution scheduler for the working-day jobs.
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
  /** Minutes since local midnight, or null when the day's times are unusable. */
  minutesOf: (day: ResolvedDay, config: WorkdayConfig) => number | null;
  run: (config: WorkdayConfig) => Promise<void>;
};

/**
 * The once-a-day jobs: resume the board in the morning, pause it at night.
 *
 * Order matters when both are due at once, which happens after a long outage:
 * replaying start and then close leaves the board paused, which is the correct
 * state for any moment after the end of the day.
 *
 * Asking "are you still working?" used to be a third job here, firing once at
 * the end of the day. It is not on this list any more: the question now repeats
 * every `recheckIntervalMinutes` for as long as someone stays WORKING out of
 * hours, and it has to keep going through midnight, the weekend and a holiday.
 * A per-calendar-day claim cannot express any of that, so runActivityCheck runs
 * on every tick instead and keeps its own per-employee deadlines.
 */
const JOBS: Job[] = [
  { name: "workday-start", minutesOf: (day) => day.startMinutes, run: runStartOfDay },
  { name: "workday-close", minutesOf: closeMinutes, run: runClose },
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

  // A dated exception overrides the weekly pattern in both directions, so this
  // is what closes a holiday and what opens a worked Saturday.
  const exception = await getWorkdayException(now.day);
  const day = resolveWorkday(config, now.weekday, exception);

  // The board jobs are anchored to a day's own hours, so a closed day has none
  // to run. Tasks paused before a holiday simply stay paused until the next
  // working morning.
  if (day.working) {
    for (const job of JOBS) {
      const scheduled = job.minutesOf(day, config);
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

  // Deliberately outside that guard: being out of hours is exactly what a
  // closed day is, so a holiday or a Sunday is when this matters most. It
  // decides for itself whether the current minute is out of hours.
  try {
    await runActivityCheck(config, day, now);
  } catch (error) {
    logger.error({ err: error }, "activity check failed");
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
