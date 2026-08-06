export type TaskState = "PENDING" | "IN_PROGRESS" | "DONE";

export type TaskParticipant = {
  id: number;
  employeeNumber: number;
  name: string;
};

export type TaskComment = {
  id: number;
  body: string;
  createdAt: string;
  author: TaskParticipant;
};

export type Task = {
  id: number;
  title: string;
  description: string;
  state: TaskState;
  startsAt: string;
  endsAt: string;
  createdAt: string;
  updatedAt: string;
  createdBy: TaskParticipant | null;
  participants: TaskParticipant[];
  commentsCount: number;
  /** Solo viene en el detalle (GET /tasks/:id). */
  comments?: TaskComment[];
};

export const STATE_ORDER: TaskState[] = ["PENDING", "IN_PROGRESS", "DONE"];

export const STATE_LABELS: Record<TaskState, string> = {
  PENDING: "Pendiente",
  IN_PROGRESS: "En curso",
  DONE: "Terminada",
};

export const STATE_COLORS: Record<TaskState, "default" | "primary" | "success"> = {
  PENDING: "default",
  IN_PROGRESS: "primary",
  DONE: "success",
};

/** El admin mueve cualquier tarea; el empleado solo si participa. */
export function canMoveTask(task: Task, meId?: number, role?: string) {
  if (role === "ADMIN") return true;
  if (!meId) return false;
  return task.participants.some((participant) => participant.id === meId);
}
