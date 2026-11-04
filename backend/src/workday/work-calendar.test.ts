import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createWorkCalendar } from "./work-calendar";
import { summarize, teamTaskTimes, workedByDay, workedMs } from "../activities/activity-summary";
import { workedProgress } from "../tasks/task-timing";

const HOUR = 3_600_000;
const ZONE = "America/Argentina/Buenos_Aires";

/** Monday to Friday, 09:00 to 17:30 in Buenos Aires (UTC-3, no DST). */
const config = {
  workingWeekdays: [1, 2, 3, 4, 5],
  startTime: "09:00",
  endTime: "17:30",
  weekdaySchedule: {},
  timezone: ZONE,
};

/** Local wall-clock time in Buenos Aires as an instant. */
const local = (value: string) => new Date(`${value}:00-03:00`);

describe("createWorkCalendar", () => {
  const calendar = createWorkCalendar(config, new Map());

  it("counts only the working hours of a stretch left open over a weekend", () => {
    // Friday 09:00 to Monday 12:00: 8.5 h on Friday, nothing on the weekend,
    // 3 h on Monday - not the 75 wall-clock hours.
    const start = local("2026-10-30T09:00").getTime();
    const end = local("2026-11-02T12:00").getTime();
    assert.equal(calendar.overlapMs(start, end), 11.5 * HOUR);
    assert.deepEqual(calendar.pieces(start, end), [
      { day: "2026-10-30", ms: 8.5 * HOUR },
      { day: "2026-11-02", ms: 3 * HOUR },
    ]);
  });

  it("drops the night of a stretch that crosses midnight", () => {
    const start = local("2026-11-03T16:00").getTime();
    const end = local("2026-11-04T10:00").getTime();
    assert.equal(calendar.overlapMs(start, end), 2.5 * HOUR);
  });

  it("follows the dated exceptions and the per-weekday hours", () => {
    const custom = createWorkCalendar(
      { ...config, weekdaySchedule: { "2": { start: "09:00", end: "13:00" } } },
      new Map([
        // A holiday Monday and a crunch Saturday.
        ["2026-11-02", { working: false, startTime: null, endTime: null }],
        ["2026-11-07", { working: true, startTime: "10:00", endTime: "12:00" }],
      ])
    );
    const day = (date: string) =>
      custom.overlapMs(local(`${date}T00:00`).getTime(), local(`${date}T23:59`).getTime());
    assert.equal(day("2026-11-02"), 0);
    assert.equal(day("2026-11-03"), 4 * HOUR);
    assert.equal(day("2026-11-04"), 8.5 * HOUR);
    assert.equal(day("2026-11-07"), 2 * HOUR);
    assert.equal(day("2026-11-08"), 0);
  });

  it("tells whether an instant is inside the working hours", () => {
    assert.equal(calendar.isWorkingAt(local("2026-11-04T10:00").getTime()), true);
    assert.equal(calendar.isWorkingAt(local("2026-11-04T17:30").getTime()), false);
    assert.equal(calendar.isWorkingAt(local("2026-11-04T03:00").getTime()), false);
    assert.equal(calendar.isWorkingAt(local("2026-11-07T10:00").getTime()), false);
  });

  it("returns nothing for an empty or reversed stretch", () => {
    const at = local("2026-11-04T10:00").getTime();
    assert.equal(calendar.overlapMs(at, at), 0);
    assert.equal(calendar.overlapMs(at, at - HOUR), 0);
  });
});

describe("hour counts against the working hours", () => {
  const calendar = createWorkCalendar(config, new Map());
  // The week of Monday 2 November 2026.
  const from = local("2026-11-02T00:00");
  const to = local("2026-11-09T00:00");
  const now = local("2026-11-09T12:00");

  it("caps a Working status left open the whole week at the scheduled hours", () => {
    const rows = [
      { status: "WORKING" as const, startedAt: local("2026-11-02T09:00"), endedAt: null },
    ];
    // 168 wall-clock hours in the range; 5 x 8.5 h of them are working hours.
    assert.equal(workedMs(rows, from, to, now), 159 * HOUR);
    assert.equal(workedMs(rows, from, to, now, calendar), 42.5 * HOUR);
    assert.deepEqual(
      workedByDay(rows, from, to, ZONE, now, calendar).map((day) => day.day),
      ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"]
    );
  });

  it("keeps the per-person split of a task inside the schedule", () => {
    const row = (employeeId: number, startedAt: Date, endedAt: Date | null) => ({
      employeeId,
      employee: { name: `P${employeeId}` },
      startedAt,
      endedAt,
      taskId: 7,
      taskTitle: "Cinematic",
      task: { title: "Cinematic", state: "IN_PROGRESS" as const },
    });
    const [task] = teamTaskTimes(
      [
        // Forgot to switch off on Monday evening, back on Tuesday morning.
        row(1, local("2026-11-02T09:00"), local("2026-11-03T11:00")),
        row(2, local("2026-11-04T14:00"), local("2026-11-04T16:00")),
      ],
      from,
      to,
      now,
      calendar
    );
    assert.equal(task?.totalMs, (8.5 + 2 + 2) * HOUR);
    assert.deepEqual(
      task?.byEmployee.map((person) => [person.id, person.ms]),
      [
        [1, 10.5 * HOUR],
        [2, 2 * HOUR],
      ]
    );
  });

  it("clips every status in the personal summary", () => {
    const summary = summarize(
      [
        {
          status: "OFFLINE",
          detail: "home",
          startedAt: local("2026-11-06T17:00"),
          endedAt: local("2026-11-09T09:00"),
          taskId: null,
          taskTitle: null,
          task: null,
        },
      ],
      from,
      to,
      now,
      calendar
    );
    assert.equal(summary.totalMs, 0.5 * HOUR);
  });
});

describe("workedProgress", () => {
  const calendar = createWorkCalendar(config, new Map());

  it("counts a task's time In progress inside the working hours only", () => {
    const result = workedProgress(
      [
        // Left In progress from Friday afternoon until Monday morning.
        { startedAt: local("2026-10-30T15:00"), endedAt: local("2026-11-02T10:00") },
        { startedAt: local("2026-11-04T16:00"), endedAt: null },
      ],
      calendar,
      local("2026-11-05T10:00")
    );
    assert.equal(result.workedMs, (2.5 + 1) * HOUR);
    assert.equal(result.openWorkedMs, (1.5 + 1) * HOUR);
    assert.equal(result.clockRunning, true);
  });

  it("stops the live clock outside the working hours", () => {
    const result = workedProgress(
      [{ startedAt: local("2026-11-04T16:00"), endedAt: null }],
      calendar,
      local("2026-11-04T22:00")
    );
    assert.equal(result.openWorkedMs, 1.5 * HOUR);
    assert.equal(result.clockRunning, false);
  });
});
