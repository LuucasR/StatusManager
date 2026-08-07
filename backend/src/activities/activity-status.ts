import { ActivityStatus, Prisma } from "@prisma/client";

/**
 * Estados que se ven en vivo pero NO se registran en el historial ni en los
 * reportes. "Desconectado" significa que la persona no esta y no hay nada que
 * reportar, a diferencia de "Ausente" (OFFLINE), que es una ausencia
 * justificada y si queda auditada.
 */
export const HIDDEN_FROM_HISTORY: readonly ActivityStatus[] = [
  ActivityStatus.DISCONNECTED,
];

/**
 * Fragmento de `where` para spreadear en cualquier consulta de ActivityHistory
 * que alimente historiales o reportes. Usa `notIn` para que agregar un estado
 * oculto a HIDDEN_FROM_HISTORY alcance, sin tocar las consultas.
 */
export const visibleHistoryWhere = {
  status: { notIn: [...HIDDEN_FROM_HISTORY] },
} satisfies Prisma.ActivityHistoryWhereInput;

/**
 * Estados que exigen un comentario de al menos 3 caracteres.
 *
 * WORKING salio de esta lista cuando se pudo declarar la tarea: el "en que
 * estoy trabajando" ya lo dice el tablero, y escribirlo de nuevo a mano era
 * ruido. El comentario vuelve a ser obligatorio para WORKING solo cuando se
 * elige trabajar SIN tarea (ver activity-task.ts): ahi es el unico dato que
 * queda.
 */
export const statusesRequiringDetail = new Set<ActivityStatus>([
  ActivityStatus.OFFLINE,
]);

/** Estados en los que tiene sentido declarar una tarea. */
export const statusesAllowingTask = new Set<ActivityStatus>([
  ActivityStatus.WORKING,
]);

/**
 * Tramos que SOLAPAN el rango, no los que EMPIEZAN dentro.
 *
 * Filtrar por `startedAt: { gte: from }` pierde el caso mas comun de todos: el
 * tramo abierto desde antes del rango. Consultar "hoy" a las 09:05 con el
 * estado puesto a las 08:55 no devolvia nada, y el total del resumen subcontaba
 * en silencio. La duracion se recorta despues, en segmentMs (activity-summary).
 */
export function overlappingWhere(
  from?: Date,
  to?: Date
): Prisma.ActivityHistoryWhereInput {
  const conditions: Prisma.ActivityHistoryWhereInput[] = [];
  // `to` es exclusivo: el frontend manda la medianoche local del dia siguiente.
  if (to) conditions.push({ startedAt: { lt: to } });
  if (from) conditions.push({ OR: [{ endedAt: null }, { endedAt: { gt: from } }] });
  return conditions.length ? { AND: conditions } : {};
}

/**
 * Etiquetas y colores por estado. Al tiparlo como Record<ActivityStatus, ...>
 * el compilador exige exhaustividad: agregar un estado al enum sin sumarlo aca
 * deja de compilar, en vez de fallar en runtime al generar el PDF.
 */
export const STATUS_META: Record<
  ActivityStatus,
  { label: string; color: string; pale: string }
> = {
  AVAILABLE: { label: "Disponible", color: "#208454", pale: "#E5F6ED" },
  WORKING: { label: "Trabajando", color: "#4C4DC9", pale: "#ECECFF" },
  BREAK: { label: "Descanso", color: "#A66A00", pale: "#FFF2D8" },
  LUNCH: { label: "Almuerzo", color: "#8C4EA3", pale: "#F5E9FA" },
  MEETING: { label: "Reunion", color: "#16738B", pale: "#E2F5F8" },
  OFFLINE: { label: "Ausente", color: "#666A7D", pale: "#ECEEF2" },
  DISCONNECTED: { label: "Desconectado", color: "#B23C4A", pale: "#FBE7EA" },
};
