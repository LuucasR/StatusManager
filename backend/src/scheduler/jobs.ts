import { ActivityStatus, TaskState } from "@prisma/client";
import prisma from "../prisma/client";
import { emitTaskChanged, isEmployeeOnline, sendConfirmationRequest } from "../realtime";
import { handleMissedConfirmation } from "../activities/activity-confirmation";
import { logger } from "../logger";
import type { WorkdayConfig } from "./workday";

/**
 * The two ends of the working day.
 *
 * Both are deliberately written with bulk `updateMany` rather than by going
 * through the task routes: the routes emit a TASK_STATE notification per
 * participant, and moving thirty tasks twice a day would put sixty notifications
 * nobody triggered into everyone's bell every day. The board is refreshed with a
 * single socket event instead.
 */

/**
 * End of day: ask everyone still WORKING to confirm, then pause the board.
 *
 * Only WORKING is checked. Someone on Break, at Lunch, in a Meeting or already
 * Away has told the system what they are doing; the check exists for the status
 * that claims active work.
 */
export async function runEndOfDay(config: WorkdayConfig) {
  const working = await prisma.employee.findMany({
    where: { active: true, currentStatus: ActivityStatus.WORKING },
    select: { id: true, employeeNumber: true },
  });

  let prompted = 0;
  const offline: number[] = [];

  for (const employee of working) {
    if (isEmployeeOnline(employee.id)) {
      sendConfirmationRequest(employee.id, config.confirmationTimeoutSeconds * 1000);
      prompted += 1;
    } else {
      // No tab open, so there is nothing to accept. Waiting out a timer they
      // could not possibly beat would only delay the same outcome.
      offline.push(employee.id);
    }
  }

  for (const employeeId of offline) {
    try {
      await handleMissedConfirmation(employeeId);
    } catch (error) {
      // One failure must not abandon the rest of the roster.
      logger.error({ err: error, employeeId }, "could not auto-disconnect employee");
    }
  }

  const paused = await prisma.task.updateMany({
    where: { state: TaskState.IN_PROGRESS },
    data: { state: TaskState.PENDING, autoPausedAt: new Date() },
  });

  if (paused.count > 0) emitTaskChanged({ type: "bulk" });

  logger.info(
    { prompted, autoDisconnected: offline.length, tasksPaused: paused.count },
    "end-of-day job finished"
  );
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
