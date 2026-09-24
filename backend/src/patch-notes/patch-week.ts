import { isCalendarDay, zonedNow } from "../scheduler/workday";
import { weekdayOf } from "../attendance/attendance";

/**
 * Week arithmetic for the patch notes. Pure - no database, no clock unless
 * handed one - so the calendar rules can be tested directly.
 *
 * A week is identified by its Monday as a "YYYY-MM-DD" calendar day in the
 * team's timezone, never the browser's: two people on either side of midnight
 * UTC must land in the same week.
 */

/** `day` plus `days` calendar days. Done at noon UTC so no offset can shift it. */
export function addDays(day: string, days: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Monday of the week `day` belongs to. Weeks run Monday to Sunday. */
export function weekStartOf(day: string) {
  const weekday = weekdayOf(day);
  return addDays(day, weekday === 0 ? -6 : 1 - weekday);
}

/** A real calendar day that is also a Monday. */
export function isWeekStart(value: string) {
  return isCalendarDay(value) && weekdayOf(value) === 1;
}

/** Monday of the current week in `timeZone`. */
export function currentWeekStart(timeZone: string, now: Date = new Date()) {
  return weekStartOf(zonedNow(timeZone, now).day);
}

/**
 * The instant local midnight of `day` happens in `timeZone`.
 *
 * Guesses midnight UTC, reads what the wall clock says there, and corrects by
 * the difference. The second pass covers a guess and a result that sit on
 * opposite sides of a DST change.
 */
export function zonedMidnight(day: string, timeZone: string) {
  const target = new Date(`${day}T00:00:00Z`).getTime();
  let guess = target;
  for (let pass = 0; pass < 2; pass += 1) {
    const wall = zonedNow(timeZone, new Date(guess));
    const wallMs =
      new Date(`${wall.day}T00:00:00Z`).getTime() + wall.minutes * 60_000;
    guess += target - wallMs;
  }
  return new Date(guess);
}

/** [from, to) instants of the week that starts on `weekStart`. `to` is exclusive. */
export function weekRange(weekStart: string, timeZone: string) {
  return {
    from: zonedMidnight(weekStart, timeZone),
    to: zonedMidnight(addDays(weekStart, 7), timeZone),
  };
}
