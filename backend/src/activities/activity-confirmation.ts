import { ActivityStatus, TaskState } from "@prisma/client";
import prisma from "../prisma/client";
import { emitStatusChanged, emitTaskChanged, setConfirmationTimeoutHandler } from "../realtime";
import { notify } from "../notifications/notification.service";
import { getWorkdayConfig, formatZoned } from "../scheduler/workday";
import { logger } from "../logger";

/**
 * What happens when the end-of-day check goes unanswered.
 *
 * Lives in its own module, and reaches realtime.ts through a registered handler
 * rather than being imported by it, because realtime.ts is imported by
 * notification.service.ts: wiring it the direct way would close an import cycle.
 */

const EMPLOYEE_PUBLIC = {
  id: true,
  employeeNumber: true,
  name: true,
  currentStatus: true,
  statusSince: true,
} as const;

/**
 * Closes the open segment and opens an AUTO_DISCONNECTED one.
 *
 * Mirrors POST /activities/status rather than just writing `currentStatus`: the
 * open segment has to be closed or the person accumulates time against a status
 * they are no longer in, and the summary would keep counting them as working
 * all night.
 *
 * Returns the task they were on, which the admin notification quotes.
 */
async function autoDisconnect(employeeId: number, detail: string) {
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    // Read the open segment BEFORE closing it: that is where the declared task
    // lives, and it is the only record of what they were doing.
    const open = await tx.activityHistory.findFirst({
      where: { employeeId, endedAt: null },
      select: { status: true, taskTitle: true, taskId: true },
      orderBy: { startedAt: "desc" },
    });

    await tx.activityHistory.updateMany({
      where: { employeeId, endedAt: null },
      data: { endedAt: now },
    });

    await tx.activityHistory.create({
      data: {
        employeeId,
        status: ActivityStatus.AUTO_DISCONNECTED,
        detail,
        startedAt: now,
      },
    });

    const employee = await tx.employee.update({
      where: { id: employeeId },
      data: {
        currentStatus: ActivityStatus.AUTO_DISCONNECTED,
        statusSince: now,
      },
      select: EMPLOYEE_PUBLIC,
    });

    return {
      employee,
      taskTitle: open?.taskTitle ?? null,
      taskId: open?.taskId ?? null,
      at: now,
    };
  });
}

/**
 * Pauses the task they had declared, so the board stops claiming work nobody is
 * doing and the next working morning can put it back.
 *
 * A task has participants, not an owner, so it is paused only when NOBODY is
 * left working on it. Disconnecting one person must not stop a colleague's task
 * out from under them, and the end-of-day sweep in jobs.ts applies the same
 * rule for the same reason.
 *
 * `autoPausedAt` is what makes this reversible: runStartOfDay resumes exactly
 * the tasks carrying that stamp and leaves alone the ones nobody ever started.
 */
async function pauseDeclaredTask(taskId: number, employeeId: number) {
  const paused = await prisma.task.updateMany({
    where: {
      id: taskId,
      state: TaskState.IN_PROGRESS,
      NOT: {
        participants: {
          some: {
            employeeId: { not: employeeId },
            employee: { active: true, currentStatus: ActivityStatus.WORKING },
          },
        },
      },
    },
    data: { state: TaskState.PENDING, autoPausedAt: new Date() },
  });

  if (paused.count > 0) emitTaskChanged({ type: "bulk" });
  return paused.count > 0;
}

/** Active administrators, who are the ones told about a missed check. */
async function adminIds() {
  const admins = await prisma.employee.findMany({
    where: { role: "ADMIN", active: true },
    select: { id: true },
  });
  return admins.map((admin) => admin.id);
}

/**
 * Marks the employee and tells every admin, one notification per person who did
 * not answer rather than a daily digest: each one names a specific employee, a
 * specific time and the task they had declared, which is what makes it
 * actionable.
 */
export async function handleMissedConfirmation(employeeId: number) {
  const config = await getWorkdayConfig();

  // Not "end-of-day" any more: the same check repeats through the night, the
  // weekend and a holiday, so the detail has to read correctly at 03:00 too.
  const { employee, taskTitle, taskId, at } = await autoDisconnect(
    employeeId,
    "Did not answer the activity check"
  );

  emitStatusChanged(employee);

  const taskPaused = taskId !== null && (await pauseDeclaredTask(taskId, employeeId));

  const { date, time } = formatZoned(config.timezone, at);
  const task = taskTitle
    ? ` They were working on "${taskTitle}".`
    : " No task had been declared.";

  await notify({
    recipientIds: await adminIds(),
    // The employee is the actor, so an admin who misses their own check is not
    // notified about themselves.
    actorId: employeeId,
    type: "ACTIVITY_NO_RESPONSE",
    title: "Auto-disconnected",
    body:
      `${employee.name} (#${employee.employeeNumber}) was disconnected by the app ` +
      `on ${date} at ${time}.${task}`,
  });

  logger.info(
    { employeeId, employeeNumber: employee.employeeNumber, taskTitle, taskPaused },
    "employee auto-disconnected after missing the activity check"
  );
}

/**
 * Called once at boot. Registering the handler instead of importing it from
 * realtime.ts is what keeps the module graph acyclic.
 */
export function registerConfirmationHandlers() {
  setConfirmationTimeoutHandler(handleMissedConfirmation);
}
