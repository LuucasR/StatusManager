import { Prisma, TaskState } from "@prisma/client";
import type { ChecklistDiff } from "./task-checklist";

type Tx = Prisma.TransactionClient;

/**
 * Every kind of line the task history can show. Stored as TEXT (TaskEvent.type),
 * so this list is the contract; the frontend has one translation per entry.
 */
export const TASK_EVENT_TYPES = [
  "CREATED",
  "APPROVED",
  "REJECTED",
  "EDITED",
  "STATE_CHANGED",
  "AUTO_COMPLETED",
  "RESTORED",
  "PINNED",
  "UNPINNED",
  "COLOR_CHANGED",
  "PARTICIPANT_ADDED",
  "PARTICIPANT_REMOVED",
  "ITEM_CREATED",
  "ITEM_RENAMED",
  "ITEM_DELETED",
  "ITEM_ASSIGNED",
  "ITEM_UNASSIGNED",
  "ITEM_DONE",
  "ITEM_UNDONE",
] as const;

export type TaskEventType = (typeof TASK_EVENT_TYPES)[number];

export type TaskEventInput = {
  type: TaskEventType;
  /** The person it happened to (added, put in charge...). */
  targetId?: number;
  itemText?: string;
  detail?: string | null;
};

/**
 * Writes history lines inside the caller's transaction. `actorId` null means
 * the system did it. Names are looked up here, once for the whole batch, and
 * stored as snapshots so the line survives the account being deleted.
 */
export async function recordTaskEvents(
  tx: Tx,
  taskId: number,
  actorId: number | null,
  events: TaskEventInput[]
) {
  if (!events.length) return;

  const ids = [
    ...new Set([
      ...(actorId ? [actorId] : []),
      ...events.flatMap((event) => (event.targetId ? [event.targetId] : [])),
    ]),
  ];
  const people = ids.length
    ? await tx.employee.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
    : [];
  const names = new Map(people.map((person) => [person.id, person.name]));

  await tx.taskEvent.createMany({
    data: events.map((event) => ({
      taskId,
      type: event.type,
      actorId,
      actorName: actorId ? (names.get(actorId) ?? null) : null,
      targetId: event.targetId ?? null,
      targetName: event.targetId ? (names.get(event.targetId) ?? null) : null,
      itemText: event.itemText ?? null,
      detail: event.detail ?? null,
    })),
  });
}

/** What PATCH /tasks/:id is about to change, as history lines. Pure: unit tested. */
export function taskEditEvents(input: {
  current: {
    title: string;
    description: string;
    startsAt: Date;
    endsAt: Date;
    state: TaskState;
    checklist: { id: number; text: string; assignees: { employeeId: number }[] }[];
  };
  next: {
    title?: string;
    description?: string;
    startsAt?: Date;
    endsAt?: Date;
    state?: TaskState;
  };
  added: number[];
  removed: number[];
  checklistDiff: ChecklistDiff | null;
}): TaskEventInput[] {
  const { current, next, added, removed, checklistDiff } = input;
  const events: TaskEventInput[] = [];

  const edited: string[] = [];
  if (next.title !== undefined && next.title !== current.title) edited.push("title");
  if (next.description !== undefined && next.description !== current.description) {
    edited.push("description");
  }
  if (
    (next.startsAt && next.startsAt.getTime() !== current.startsAt.getTime()) ||
    (next.endsAt && next.endsAt.getTime() !== current.endsAt.getTime())
  ) {
    edited.push("dates");
  }
  if (edited.length) events.push({ type: "EDITED", detail: edited.join(",") });

  if (next.state && next.state !== current.state) {
    events.push({ type: "STATE_CHANGED", detail: next.state });
  }

  for (const targetId of added) events.push({ type: "PARTICIPANT_ADDED", targetId });
  for (const targetId of removed) events.push({ type: "PARTICIPANT_REMOVED", targetId });

  if (checklistDiff) {
    const before = new Map(current.checklist.map((item) => [item.id, item]));

    for (const id of checklistDiff.deletedIds) {
      events.push({ type: "ITEM_DELETED", itemText: before.get(id)?.text });
    }
    for (const item of checklistDiff.creates) {
      events.push({ type: "ITEM_CREATED", itemText: item.text });
      for (const targetId of item.assigneeIds) {
        events.push({ type: "ITEM_ASSIGNED", itemText: item.text, targetId });
      }
    }
    for (const item of checklistDiff.updates) {
      const old = before.get(item.id);
      if (!old) continue;
      if (old.text !== item.text) {
        events.push({ type: "ITEM_RENAMED", itemText: item.text, detail: old.text });
      }
      const was = old.assignees.map((link) => link.employeeId);
      // Somebody leaving the task leaves its items too, and that is already
      // told by PARTICIPANT_REMOVED: one line, not one per item.
      for (const targetId of was) {
        if (!item.assigneeIds.includes(targetId) && !removed.includes(targetId)) {
          events.push({ type: "ITEM_UNASSIGNED", itemText: item.text, targetId });
        }
      }
      for (const targetId of item.assigneeIds) {
        if (!was.includes(targetId)) {
          events.push({ type: "ITEM_ASSIGNED", itemText: item.text, targetId });
        }
      }
    }
  }

  return events;
}
