import { Prisma } from "@prisma/client";
import { syncTaskConversationState } from "../chat/chat.service";

type Tx = Prisma.TransactionClient;

/** One item as the client sends it: no id means "new". */
export type ChecklistInput = { id?: number; text: string; assigneeId?: number | null };

export type ChecklistDiff = {
  /** Ids in the payload that this task does not own. Non-empty means refuse. */
  unknownIds: number[];
  /** Existing rows, with their new text, assignee and position. */
  updates: { id: number; text: string; position: number; assigneeId: number | null }[];
  /** Rows to insert, already carrying their position. */
  creates: { text: string; position: number; assigneeId: number | null }[];
  /** Every assignee the payload asks for. The route checks them against the
   *  task's participants, which is a rule no database constraint can express. */
  assigneeIds: number[];
  /** Existing rows the payload dropped. */
  deletedIds: number[];
};

/**
 * Works out what to write for a checklist that arrives as a whole ordered array.
 *
 * Pure, and separated from the route for the same reason the workday arithmetic
 * is: the failure mode is silent. A blind deleteMany + createMany also "works" -
 * it just unticks every box each time somebody fixes a typo in the title, and
 * nothing in a type check or a build would notice. TaskParticipant already
 * learned the cheaper half of this lesson, where the cost was only the avatars
 * reshuffling on the card.
 *
 * The array index IS the position, so reordering rows in the UI reorders them
 * here with no extra field on the wire.
 */
export function diffChecklist(
  current: { id: number }[],
  next: ChecklistInput[]
): ChecklistDiff {
  const currentIds = new Set(current.map((item) => item.id));

  const unknownIds = next
    .map((item) => item.id)
    .filter((id): id is number => id !== undefined && !currentIds.has(id));

  const updates: ChecklistDiff["updates"] = [];
  const creates: ChecklistDiff["creates"] = [];
  const kept = new Set<number>();

  next.forEach((item, position) => {
    // undefined and null both mean "nobody": the column is written on every
    // save, so leaving it undefined would make Prisma skip the field and an
    // assignment the user cleared would come straight back.
    const assigneeId = item.assigneeId ?? null;

    if (item.id === undefined) {
      creates.push({ text: item.text, position, assigneeId });
    } else {
      kept.add(item.id);
      updates.push({ id: item.id, text: item.text, position, assigneeId });
    }
  });

  return {
    unknownIds,
    updates,
    creates,
    assigneeIds: [
      ...new Set(
        next.map((item) => item.assigneeId).filter((id): id is number => typeof id === "number")
      ),
    ],
    deletedIds: [...currentIds].filter((id) => !kept.has(id)),
  };
}

/**
 * Applies the per-task auto-complete rule, inside the caller's transaction.
 *
 * Called from the two places that can leave a checklist fully ticked: the item
 * route (somebody ticked the last box) and the update route (a manager deleted
 * the only item that was still open). Returns true when it actually moved the
 * task, so the caller can send the same TASK_STATE notification every other path
 * to DONE sends.
 *
 * It is ONE-DIRECTIONAL: unticking an item does not reopen a task that is
 * already DONE. Going back is a decision a person makes, exactly like any other
 * move on the board, and automating it would fight the end-of-day job, which
 * moves tasks between PENDING and IN_PROGRESS on its own.
 *
 * An empty checklist never completes anything: "no items" is not "all items
 * done", and a task created with the switch on but no items yet would otherwise
 * file itself as finished the moment it was saved.
 */
export async function applyChecklistAutoComplete(tx: Tx, taskId: number) {
  const task = await tx.task.findUnique({
    where: { id: taskId },
    select: {
      state: true,
      autoCompleteOnChecklist: true,
      checklist: { select: { done: true } },
    },
  });

  if (!task || !task.autoCompleteOnChecklist) return false;
  if (task.state === "DONE") return false;
  if (task.checklist.length === 0) return false;
  if (task.checklist.some((item) => !item.done)) return false;

  await tx.task.update({ where: { id: taskId }, data: { state: "DONE" } });
  // Without this the task's chat would stay open on a finished task, which no
  // other route that reaches DONE allows.
  await syncTaskConversationState(tx, taskId, "DONE");

  return true;
}
