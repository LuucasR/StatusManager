import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  checkDue,
  checkExpired,
  closeMinutes,
  isOffHours,
  promptMinutes,
  resolveWorkday,
  zonedNow,
  type WorkdayConfig,
} from "./workday";

/**
 * The working-day arithmetic.
 *
 * These are here because the whole feature turns on date maths in a timezone
 * that is not the server's. Render runs in UTC; getting this wrong does not
 * throw, it just fires the end of the day three hours late, or on the wrong
 * date, and nothing in a type check or a build would notice.
 */

const BA = "America/Argentina/Buenos_Aires";

const config: WorkdayConfig = {
  workingWeekdays: [1, 2, 3, 4, 5],
  startTime: "09:00",
  endTime: "17:30",
  timezone: BA,
  confirmationDelayMinutes: 0,
  confirmationTimeoutSeconds: 120,
  recheckIntervalMinutes: 30,
  enabled: true,
};

describe("zonedNow", () => {
  it("reports the configured zone's wall clock, not UTC", () => {
    // 20:35 UTC is 17:35 in Buenos Aires (-03). Reading the UTC hour here is the
    // bug this whole module exists to avoid.
    const now = zonedNow(BA, new Date("2026-03-10T20:35:00Z"));
    assert.equal(now.minutes, 17 * 60 + 35);
    assert.equal(now.day, "2026-03-10");
  });

  it("keeps the local calendar date when UTC has already rolled over", () => {
    // 01:30 UTC on the 11th is still 22:30 on the 10th in Buenos Aires. Using the
    // UTC date as the job's per-day key would let a day be claimed twice.
    const now = zonedNow(BA, new Date("2026-03-11T01:30:00Z"));
    assert.equal(now.day, "2026-03-10");
    assert.equal(now.minutes, 22 * 60 + 30);
  });

  it("counts local midnight as minute 0, not 1440", () => {
    // The reason for hourCycle: "h23". Some runtimes report midnight as hour 24
    // under hour12: false, which would put every job past the end of its day.
    const now = zonedNow(BA, new Date("2026-03-11T03:00:00Z"));
    assert.equal(now.minutes, 0);
    assert.equal(now.day, "2026-03-11");
  });

  it("reports the weekday in the configured zone", () => {
    // Sunday 22:30 local, already Monday in UTC.
    const now = zonedNow(BA, new Date("2026-03-09T01:30:00Z"));
    assert.equal(now.weekday, 0);
  });
});

describe("resolveWorkday", () => {
  it("opens a weekday that is in the pattern", () => {
    const day = resolveWorkday(config, 3, null);
    assert.equal(day.working, true);
    assert.equal(day.startMinutes, 9 * 60);
    assert.equal(day.endMinutes, 17 * 60 + 30);
  });

  it("closes a weekday that is not", () => {
    assert.equal(resolveWorkday(config, 6, null).working, false);
    assert.equal(resolveWorkday(config, 0, null).working, false);
  });

  it("follows a pattern that is not Monday to Friday", () => {
    const sixDays = { ...config, workingWeekdays: [1, 2, 3, 4, 5, 6] };
    assert.equal(resolveWorkday(sixDays, 6, null).working, true);
  });

  it("lets a holiday close a working weekday", () => {
    const day = resolveWorkday(config, 3, {
      working: false,
      startTime: null,
      endTime: null,
    });
    assert.equal(day.working, false);
  });

  it("lets an exception open a weekend", () => {
    const day = resolveWorkday(config, 6, {
      working: true,
      startTime: null,
      endTime: null,
    });
    assert.equal(day.working, true);
    // Inherits the default hours when the exception does not give its own.
    assert.equal(day.endMinutes, 17 * 60 + 30);
  });

  it("lets an exception override the hours for a half day", () => {
    const day = resolveWorkday(config, 4, {
      working: true,
      startTime: "09:00",
      endTime: "13:00",
    });
    assert.equal(day.endMinutes, 13 * 60);
  });

  it("returns null minutes for a malformed time instead of throwing", () => {
    const broken = { ...config, endTime: "25:99" };
    assert.equal(resolveWorkday(broken, 3, null).endMinutes, null);
  });
});

describe("derived prompt and close times", () => {
  it("puts the prompt at the end of the day plus the grace period", () => {
    const day = resolveWorkday({ ...config, confirmationDelayMinutes: 15 }, 3, null);
    const withDelay = { ...config, confirmationDelayMinutes: 15 };
    assert.equal(promptMinutes(day, withDelay), 17 * 60 + 45);
  });

  it("puts the close a whole number of minutes after the prompt", () => {
    // 90 seconds still has to occupy a minute slot: the scheduler only has
    // minute resolution, so a rounded-down timeout would close before the
    // answer window had actually elapsed.
    const withTimeout = { ...config, confirmationTimeoutSeconds: 90 };
    const day = resolveWorkday(withTimeout, 3, null);
    assert.equal(closeMinutes(day, withTimeout), 17 * 60 + 30 + 2);
  });

  it("clamps to 23:59 rather than running past midnight", () => {
    // A derived time of 24:10 would never be reached inside the same local day,
    // so the day would never close: everyone stays marked as working and every
    // task stays in progress. Late is wrong by minutes; never is wrong by a day.
    const late = {
      ...config,
      endTime: "23:50",
      confirmationDelayMinutes: 20,
      confirmationTimeoutSeconds: 600,
    };
    const day = resolveWorkday(late, 3, null);
    assert.equal(promptMinutes(day, late), 23 * 60 + 59);
    assert.equal(closeMinutes(day, late), 23 * 60 + 59);
  });

  it("returns null when the day's end time is unusable", () => {
    const broken = { ...config, endTime: "nope" };
    const day = resolveWorkday(broken, 3, null);
    assert.equal(promptMinutes(day, broken), null);
    assert.equal(closeMinutes(day, broken), null);
  });
});

describe("isOffHours", () => {
  it("covers a closed day end to end", () => {
    const weekend = resolveWorkday(config, 6, null);
    assert.equal(isOffHours(weekend, config, 0), true);
    assert.equal(isOffHours(weekend, config, 12 * 60), true);
    assert.equal(isOffHours(weekend, config, 23 * 60 + 59), true);
  });

  it("is false inside a working day's own hours", () => {
    const day = resolveWorkday(config, 3, null);
    assert.equal(isOffHours(day, config, 9 * 60), false);
    assert.equal(isOffHours(day, config, 13 * 60), false);
    // 17:29 is still inside; the prompt goes out at 17:30.
    assert.equal(isOffHours(day, config, 17 * 60 + 29), false);
  });

  it("starts at the prompt time, grace period included", () => {
    const withDelay = { ...config, confirmationDelayMinutes: 15 };
    const day = resolveWorkday(withDelay, 3, null);
    assert.equal(isOffHours(day, withDelay, 17 * 60 + 40), false);
    assert.equal(isOffHours(day, withDelay, 17 * 60 + 45), true);
  });

  it("still reports off-hours after midnight on a working day", () => {
    // The case the whole recurring check turns on: 02:00 on a Tuesday is a
    // working day by the calendar, but nobody's hours have started, so someone
    // who has been "working" since Monday evening still gets asked.
    const day = resolveWorkday(config, 2, null);
    assert.equal(isOffHours(day, config, 2 * 60), true);
    assert.equal(isOffHours(day, config, 8 * 60 + 59), true);
    assert.equal(isOffHours(day, config, 9 * 60), false);
  });

  it("reports false for malformed hours instead of prompting everybody", () => {
    // An unusable configuration must not read as "out of hours for the whole
    // roster", which would ask everyone at once and disconnect whoever missed it.
    const broken = { ...config, endTime: "nope" };
    assert.equal(isOffHours(resolveWorkday(broken, 3, null), broken, 3 * 60), false);
  });
});

describe("checkDue", () => {
  const now = new Date("2026-03-10T23:00:00Z");

  it("is due when nobody has ever been asked", () => {
    assert.equal(checkDue(null, 30, now), true);
  });

  it("is not due before the interval has elapsed", () => {
    const asked = new Date(now.getTime() - 29 * 60_000);
    assert.equal(checkDue(asked, 30, now), false);
  });

  it("is due exactly on the interval", () => {
    const asked = new Date(now.getTime() - 30 * 60_000);
    assert.equal(checkDue(asked, 30, now), true);
  });

  it("fires immediately on a stamp from a previous stretch", () => {
    // This is what makes the first prompt of an evening need no special case:
    // yesterday's stamp is older than any interval.
    const yesterday = new Date(now.getTime() - 20 * 60 * 60_000);
    assert.equal(checkDue(yesterday, 30, now), true);
  });
});

describe("checkExpired", () => {
  const now = new Date("2026-03-10T23:00:00Z");
  const asked = new Date(now.getTime() - 5 * 60_000);

  it("is not expired when there is no prompt outstanding", () => {
    assert.equal(checkExpired(null, null, 120, now), false);
  });

  it("is not expired once they answered after being asked", () => {
    const answered = new Date(asked.getTime() + 10_000);
    assert.equal(checkExpired(asked, answered, 120, now), false);
  });

  it("ignores an answer that predates the question", () => {
    // Yesterday's confirmation must not clear today's check.
    const stale = new Date(asked.getTime() - 60_000);
    assert.equal(checkExpired(asked, stale, 120, now), true);
  });

  it("is not expired while still inside the answer window", () => {
    const justAsked = new Date(now.getTime() - 30_000);
    assert.equal(checkExpired(justAsked, null, 120, now), false);
  });

  it("expires exactly on the timeout", () => {
    const onTheDot = new Date(now.getTime() - 120_000);
    assert.equal(checkExpired(onTheDot, null, 120, now), true);
  });
});
