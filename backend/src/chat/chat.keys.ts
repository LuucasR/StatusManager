/**
 * Claves naturales de conversacion. Se construyen SOLO aca, nunca a mano:
 * son la unica garantia de idempotencia del get-or-create (columna
 * `Conversation.key` con indice unico).
 */

export const GENERAL_KEY = "general";

/** Ordenado por min/max para que el par sea el mismo mire quien lo mire. */
export function directKey(a: number, b: number) {
  return `d:${Math.min(a, b)}:${Math.max(a, b)}`;
}

export function taskKey(taskId: number) {
  return `t:${taskId}`;
}
