/**
 * Natural conversation keys. Built ONLY here, never by hand: they are the
 * only thing guaranteeing the get-or-create is idempotent (the
 * `Conversation.key` column has a unique index).
 */

export const GENERAL_KEY = "general";

/** Ordered by min/max so the pair is the same whoever is looking at it. */
export function directKey(a: number, b: number) {
  return `d:${Math.min(a, b)}:${Math.max(a, b)}`;
}

export function taskKey(taskId: number) {
  return `t:${taskId}`;
}
