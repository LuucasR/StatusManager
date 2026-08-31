import { ActivityStatus, TaskState } from "@prisma/client";
import prisma from "../prisma/client";
import { emitTaskChanged, isEmployeeOnline, sendConfirmationRequest } from "../realtime";
import { handleMissedConfirmation } from "../activities/activity-confirmation";
import { logger } from "../logger";
import type { WorkdayConfig } from "./workday";

/**
 * The three points of the working day.
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
 * End of day, part one: ask everyone still WORKING whether they still are.
 *
 * Only WORKING is asked. Someone on Break, at Lunch, in a Meeting or already
 * Away has told the system what they are doing; the check exists for the status
 * that claims active work.
 *
 * Nothing is paused here. That happens in runClose, after people have had the
 * chance to answer - which is the whole point of asking.
 */
export async function runPrompt(config: WorkdayConfig) {
  const working = await prisma.employee.findMany({
    where: { active: true, currentStatus: ActivityStatus.WORKING },
    select: { id: true },
  });

  let prompted = 0;
  let disconnected = 0;

  for (const employee of working) {
    if (isEmployeeOnline(employee.id)) {
      sendConfirmationRequest(employee.id, config.confirmationTimeoutSeconds * 1000);
      prompted += 1;
    } else {
      // No tab open, so there is nothing to accept. Waiting out a timer they
      // could not possibly beat would only delay the same outcome.
      if (await disconnectQuietly(employee.id)) disconnected += 1;
    }
  }

  logger.info({ prompted, autoDisconnected: disconnected }, "workday prompt finished");
}

/**
 * End of day, part two: resolve the unanswered checks and pause the board.
 *
 * Who counts as having answered is read from the database, not from the
 * in-memory timer: `lastConfirmedAt` against the moment the prompt job ran,
 * which the scheduler already records as that job's `ranAt`. A restart between
 * the two jobs therefore loses nothing.
 */
export async function runClose(_config: WorkdayConfig) {
  const promptRun = await prisma.scheduledJobRun.findUnique({
    where: { job: "workday-prompt" },
    select: { ranAt: true },
  });

  // No prompt on record (first deploy, or the row was cleared): treat nobody as
  // having confirmed rather than everybody.
  const since = promptRun?.ranAt ?? new Date();

  const confirmed = await prisma.employee.findMany({
    where: { active: true, lastConfirmedAt: { gte: since } },
    select: { id: true },
  });
  const confirmedIds = confirmed.map((employee) => employee.id);

  // Still claiming to work and never answered.
  const silent = await prisma.employee.findMany({
    where: {
      active: true,
      currentStatus: ActivityStatus.WORKING,
      id: { notIn: confirmedIds },
    },
    select: { id: true },
  });

  let disconnected = 0;
  for (const employee of silent) {
    if (await disconnectQuietly(employee.id)) disconnected += 1;
  }

  // A task has participants, not an owner, so "pause the tasks of whoever did
  // not answer" is ambiguous the moment two people share one. The rule is that
  // a single confirmation keeps the task alive: it is paused only when NONE of
  // its participants confirmed.
  //
  // An empty confirmedIds makes the inner `some` match nothing, so the NOT
  // matches everything - which is exactly right when nobody answered.
  const paused = await prisma.task.updateMany({
    where: {
      state: TaskState.IN_PROGRESS,
      NOT: { participants: { some: { employeeId: { in: confirmedIds } } } },
    },
    data: { state: TaskState.PENDING, autoPausedAt: new Date() },
  });

  if (paused.count > 0) emitTaskChanged({ type: "bulk" });

  logger.info(
    { confirmed: confirmedIds.length, autoDisconnected: disconnected, tasksPaused: paused.count },
    "workday close finished"
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
