import { LOCALE } from "../../locale";
import { t } from "../../i18n";

const pad = (value: number) => String(value).padStart(2, "0");

/**
 * ISO (UTC) -> "YYYY-MM-DDTHH:mm" in local time, which is what
 * <input type="datetime-local"> expects. toISOString().slice(0,16) is not used
 * because that shifts the time by the offset (-3 in Argentina).
 */
export function toLocalInputValue(iso: string) {
  const date = new Date(iso);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

/** "YYYY-MM-DDTHH:mm" (local) -> ISO UTC. new Date() without an offset assumes local. */
export function fromLocalInputValue(value: string) {
  return new Date(value).toISOString();
}

const dayFormatter = new Intl.DateTimeFormat(LOCALE, {
  day: "2-digit",
  month: "short",
});

// hour12: false so it reads "21:12" and not "09:12 pm", which besides being
// longer squeezes the card when the range spans two days.
const timeFormatter = new Intl.DateTimeFormat(LOCALE, {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** "6 Aug 10:00 - 14:30" when it is the same day, repeating the date if not. */
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

/** "Today" / "Yesterday" / "6 Aug" - for grouping lists by day. */
export function relativeDay(iso: string) {
  const date = new Date(iso);
  const startOfDay = (value: Date) =>
    new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const days = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000);
  if (days <= 0) return t("date.today");
  if (days === 1) return t("date.yesterday");
  return dayFormatter.format(date);
}
