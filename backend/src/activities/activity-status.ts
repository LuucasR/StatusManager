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

/** Estados que exigen un comentario de al menos 3 caracteres. */
export const statusesRequiringDetail = new Set<ActivityStatus>([
  ActivityStatus.WORKING,
  ActivityStatus.OFFLINE,
]);

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
