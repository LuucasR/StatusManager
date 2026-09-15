import { ActivityStatus, TaskState } from "@prisma/client";
import prisma from "../prisma/client";
import {
  emitTaskChanged,
  hasPendingConfirmation,
  sendConfirmationRequest,
} from "../realtime";
import { handleMissedConfirmation } from "../activities/activity-confirmation";
import { logger } from "../logger";
import {
  activityCheckAction,
  isOffHours,
  type ResolvedDay,
  type WorkdayConfig,
  type ZonedNow,
} from "./workday";

/**
 * The points of the working day, plus the check that runs between them.
 *
 * The bulk moves are deliberately written with `updateMany` rather than by going
 * through the task routes: the routes emit a TASK_STATE notification per
 * participant, and moving thirty tasks twice a day would put sixty notifications
 * nobody triggered into everyone's bell every day. The board is refreshed with a
 * single socket event instead.
 */

/** One auto-disconnect, isolated so one failure cannot abandon the roster. */
async function disconnectQuietly(employeeId: number) {
  try {
    await handleMissedConfirmation(employeeId);
    return true;
  } catch (error) {
    logger.error({ err: error, employeeId }, "could not auto-disconnect employee");
    return false;
  }
}

/**
 * The out-of-hours check: ask everyone still WORKING whether they still are,
 * and keep asking every `recheckIntervalMinutes` until they stop being WORKING.
 *
 * Runs on EVERY tick, including on closed days, because the window it cares
 * about - `isOffHours` - spans the night, the weekend and a holiday. That is
 * also why it is not one of the JOBS in index.ts: those claim a calendar day and
 * fire once, and a check that repeats and crosses midnight cannot be expressed
 * that way. Its idempotency is per employee instead, `lastPromptedAt` plus the
 * interval, which two instances ticking at the same second cannot both pass.
 *
 * Only WORKING is asked. Someone on Break, at Lunch, in a Meeting or already
 * Away has told the system what they are doing; the check exists for the status
 * that claims active work.
 *
 * Nothing is paused here. Pausing is a consequence of not answering, and lives
 * in handleMissedConfirmation, next to the disconnect it belongs to.
 */
export async function runActivityCheck(config: WorkdayConfig, day: ResolvedDay, now: ZonedNow) {
  if (!isOffHours(day, config, now.minutes)) return;

  const working = await prisma.employee.findMany({
    where: { active: true, currentStatus: ActivityStatus.WORKING },
    select: { id: true, lastPromptedAt: true, lastConfirmedAt: true, missedChecks: true },
  });

  const at = new Date();
  let prompted = 0;
  let missed = 0;
  let disconnected = 0;

  for (const employee of working) {
    const { id, missedChecks } = employee;
    const awaitingRetry = missedChecks > 0;

    // Skipped as "disconnect" while realtime.ts still holds a live timer for
    // them: that one is about to resolve this same check, and running both would
    // disconnect the person twice. "wait" keeps a short interval from stacking a
    // second prompt on top of an unanswered one.
    const action = activityCheckAction(employee, config, at, hasPendingConfirmation(id));

    if (action === "disconnect") {
      if (await disconnectQuietly(id)) disconnected += 1;
      continue;
    }
    if (action !== "prompt") continue;

    // Its own return value reports "no tab open" - asking it rather than
    // checking presence separately closes the gap where they disconnect between
    // the two calls, which would stamp a deadline against a prompt never sent.
    if (!sendConfirmationRequest(id, config.confirmationTimeoutSeconds * 1000)) {
      // Nothing there to accept it. In a browser that reliably means no tab is
      // open, but Android tears the socket down about a minute after the screen
      // goes off, and disconnecting on that alone auto-disconnected anyone who
      // pocketed their phone - without ever asking them. So the first miss only
      // costs them another interval; the second one in a row is what counts.
      if (awaitingRetry) {
        if (await disconnectQuietly(id)) disconnected += 1;
        continue;
      }

      // Stamped exactly like a real prompt, so the retry lands one interval
      // from now instead of on the very next tick a minute later - which would
      // spend the whole grace before the phone had any chance to come back.
      await prisma.employee.update({
        where: { id },
        data: { lastPromptedAt: at, missedChecks: { increment: 1 } },
      });
      missed += 1;
      continue;
    }

    // Stamped only once the prompt has actually gone out, so the answer window
    // starts when the question did. Reachable again also settles any earlier
    // miss: whatever it saw was temporary.
    await prisma.employee.update({
      where: { id },
      data: { lastPromptedAt: at, missedChecks: 0 },
    });
    prompted += 1;
  }

  if (prompted > 0 || missed > 0 || disconnected > 0) {
    logger.info({ prompted, missed, autoDisconnected: disconnected }, "activity check finished");
  }
}

/**
 * End of day: pause the board.
 *
 * Disconnecting whoever ignored the check is no longer this job's business -
 * runActivityCheck owns that, per employee and on its own timer. What is left
 * is the board sweep, and dropping the confirmation bookkeeping made its rule
 * simpler: by the time this runs, anybody who answered is still WORKING and
 * anybody who did not has already been auto-disconnected out of it. So the live
 * status IS the answer, and no window of `lastConfirmedAt` against some job's
 * `ranAt` has to be reconstructed.
 *
 * A task has participants, not an owner, so a single person still working keeps
 * it alive: it is paused only when NONE of its participants is WORKING.
 */
export async function runClose(_config: WorkdayConfig) {
  const paused = await prisma.task.updateMany({
    where: {
      state: TaskState.IN_PROGRESS,
      NOT: {
        participants: {
          some: { employee: { active: true, currentStatus: ActivityStatus.WORKING } },
        },
      },
    },
    data: { state: TaskState.PENDING, autoPausedAt: new Date() },
  });

  if (paused.count > 0) emitTaskChanged({ type: "bulk" });

  logger.info({ tasksPaused: paused.count }, "workday close finished");
}

/**
 * Start of day: put back exactly the tasks last night's job paused.
 *
 * The `autoPausedAt` stamp plus `state: PENDING` is the whole rule. Requiring
 * the task to still be PENDING is what implements "unless it is finished": a
 * task somebody closed overnight is DONE, so it is not matched and does not come
 * back to life. The same condition covers a task moved by hand for any other
 * reason.
 *
 * A stamp surviving the weekend is intended: paused Friday, resumed Monday.
 */
export async function runStartOfDay(_config: WorkdayConfig) {
  const resumed = await prisma.task.updateMany({
    where: { autoPausedAt: { not: null }, state: TaskState.PENDING },
    data: { state: TaskState.IN_PROGRESS, autoPausedAt: null },
  });

  // Anything still stamped was resolved by a person overnight (finished, or
  // moved on purpose). Clearing the flag stops it being resurrected on some
  // later morning if it ever passes through PENDING again.
  const cleared = await prisma.task.updateMany({
    where: { autoPausedAt: { not: null } },
    data: { autoPausedAt: null },
  });

  if (resumed.count > 0) emitTaskChanged({ type: "bulk" });

  logger.info(
    { tasksResumed: resumed.count, staleFlagsCleared: cleared.count },
    "start-of-day job finished"
  );
}
