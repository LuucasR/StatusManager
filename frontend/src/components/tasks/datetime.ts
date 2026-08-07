const pad = (value: number) => String(value).padStart(2, "0");

/**
 * ISO (UTC) -> "YYYY-MM-DDTHH:mm" en hora local, que es lo que espera
 * <input type="datetime-local">. No se usa toISOString().slice(0,16) porque
 * eso desplaza la hora según el huso (-3 en Argentina).
 */
export function toLocalInputValue(iso: string) {
  const date = new Date(iso);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

/** "YYYY-MM-DDTHH:mm" (local) -> ISO UTC. new Date() sin offset asume local. */
export function fromLocalInputValue(value: string) {
  return new Date(value).toISOString();
}

const dayFormatter = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "short",
});

// hour12: false para que diga "21:12" y no "09:12 p. m.", que ademas de ser
// mas largo aprieta la tarjeta cuando el rango cruza dos dias.
const timeFormatter = new Intl.DateTimeFormat("es-AR", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** "6 ago 10:00 - 14:30" si es el mismo día, con la fecha repetida si no. */
export function formatRange(startsAt: string, endsAt: string) {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const sameDay = start.toDateString() === end.toDateString();

  if (sameDay) {
    return `${dayFormatter.format(start)} · ${timeFormatter.format(start)} - ${timeFormatter.format(end)}`;
  }
  return `${dayFormatter.format(start)} ${timeFormatter.format(start)} - ${dayFormatter.format(
    end
  )} ${timeFormatter.format(end)}`;
}

export function formatDuration(startsAt: string, endsAt: string) {
  const minutes = Math.max(
    0,
    Math.round((new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60_000)
  );
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  if (rest === 0) return `${hours} h`;
  return `${hours} h ${pad(rest)} min`;
}

export function formatCommentDate(iso: string) {
  const date = new Date(iso);
  return `${dayFormatter.format(date)} · ${timeFormatter.format(date)}`;
}

export function formatClock(iso: string) {
  return timeFormatter.format(new Date(iso));
}

/** "Hoy" / "Ayer" / "6 ago" — para agrupar listas por día. */
export function relativeDay(iso: string) {
  const date = new Date(iso);
  const startOfDay = (value: Date) =>
    new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const days = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000);
  if (days <= 0) return "Hoy";
  if (days === 1) return "Ayer";
  return dayFormatter.format(date);
}
