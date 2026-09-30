import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { teamTaskTimes, workedByDay, workedByTask, workedMs, type TeamTimeRow } from "./activity-summary";

const HOUR = 3_600_000;

function row(
  employeeId: number,
  startedAt: string,
  endedAt: string | null,
  taskId: number | null,
  taskTitle: string | null
): TeamTimeRow {
  return {
    employeeId,
    employee: { name: `Person ${employeeId}` },
    startedAt: new Date(startedAt),
    endedAt: endedAt ? new Date(endedAt) : null,
    taskId,
    taskTitle,
    task: taskId != null ? { title: taskTitle ?? "", state: "IN_PROGRESS" } : null,
  };
}

describe("teamTaskTimes", () => {
  const from = new Date("2026-09-21T00:00:00Z");
  const to = new Date("2026-09-28T00:00:00Z");

  it("adds time per task and splits it per person", () => {
    const result = teamTaskTimes(
      [
        row(1, "2026-09-21T10:00:00Z", "2026-09-21T12:00:00Z", 7, "Menu"),
        row(2, "2026-09-22T10:00:00Z", "2026-09-22T11:00:00Z", 7, "Menu"),
        row(1, "2026-09-23T10:00:00Z", "2026-09-23T11:00:00Z", 7, "Menu"),
      ],
      from,
      to
    );
    assert.equal(result.length, 1);
    assert.equal(result[0]!.totalMs, 4 * HOUR);
    assert.deepEqual(
      result[0]!.byEmployee.map((person) => [person.id, person.ms]),
      [[1, 3 * HOUR], [2, HOUR]]
    );
  });

  it("clips segments that cross the week's edges", () => {
    const result = teamTaskTimes(
      [row(1, "2026-09-20T23:00:00Z", "2026-09-21T01:00:00Z", 7, "Menu")],
      from,
      to
    );
    assert.equal(result[0]!.totalMs, HOUR);
  });

  it("skips work without a task and keeps deleted tasks apart by title", () => {
    const result = teamTaskTimes(
      [
        row(1, "2026-09-21T10:00:00Z", "2026-09-21T11:00:00Z", null, null),
        row(1, "2026-09-21T11:00:00Z", "2026-09-21T12:00:00Z", null, "Old A"),
        row(1, "2026-09-21T12:00:00Z", "2026-09-21T14:00:00Z", null, "Old B"),
      ],
      from,
      to
    );
    assert.deepEqual(result.map((task) => task.title), ["Old B", "Old A"]);
  });
});

describe("workedMs", () => {
  const segment = (status: "WORKING" | "BREAK" | "LUNCH", startedAt: string, endedAt: string | null) => ({
    status,
    startedAt: new Date(startedAt),
    endedAt: endedAt ? new Date(endedAt) : null,
  });

  it("counts only the time spent WORKING", () => {
    const rows = [
      segment("WORKING", "2026-09-28T12:00:00Z", "2026-09-28T14:00:00Z"),
      segment("LUNCH", "2026-09-28T14:00:00Z", "2026-09-28T15:00:00Z"),
      segment("WORKING", "2026-09-28T15:00:00Z", "2026-09-28T16:30:00Z"),
      segment("BREAK", "2026-09-28T16:30:00Z", "2026-09-28T17:00:00Z"),
    ];
    assert.equal(workedMs(rows, undefined, undefined), 3.5 * HOUR);
  });

  it("clips segments to the range and counts the open one up to now", () => {
    const rows = [
      segment("WORKING", "2026-09-27T22:00:00Z", "2026-09-28T02:00:00Z"),
      segment("WORKING", "2026-09-28T10:00:00Z", null),
    ];
    const from = new Date("2026-09-28T00:00:00Z");
    const to = new Date("2026-09-29T00:00:00Z");
    const now = new Date("2026-09-28T11:00:00Z");
    assert.equal(workedMs(rows, from, to, now), 3 * HOUR);
  });

  it("splits worked time per day in the team's timezone", () => {
    // 23:00Z-04:00Z is 20:00-01:00 in Buenos Aires (UTC-3): 4 h on the 28th and
    // 1 h on the 29th, plus 13:00Z-15:00Z (10:00-12:00 local) on the 29th.
    const rows = [
      segment("WORKING", "2026-09-28T23:00:00Z", "2026-09-29T04:00:00Z"),
      segment("WORKING", "2026-09-29T13:00:00Z", "2026-09-29T15:00:00Z"),
      segment("BREAK", "2026-09-29T15:00:00Z", "2026-09-29T16:00:00Z"),
    ];
    assert.deepEqual(
      workedByDay(rows, undefined, undefined, "America/Argentina/Buenos_Aires"),
      [
        { day: "2026-09-28", ms: 4 * HOUR },
        { day: "2026-09-29", ms: 3 * HOUR },
      ]
    );
  });
});

describe("workedByTask", () => {
  it("splits worked time per task, no-task time last, ignoring other statuses", () => {
    const rows = [
      { status: "WORKING" as const, startedAt: new Date("2026-09-28T12:00:00Z"), endedAt: new Date("2026-09-28T13:00:00Z"), taskId: null, taskTitle: null },
      { status: "WORKING" as const, startedAt: new Date("2026-09-28T13:00:00Z"), endedAt: new Date("2026-09-28T15:00:00Z"), taskId: 7, taskTitle: "Login" },
      { status: "LUNCH" as const, startedAt: new Date("2026-09-28T15:00:00Z"), endedAt: new Date("2026-09-28T16:00:00Z"), taskId: null, taskTitle: null },
      { status: "WORKING" as const, startedAt: new Date("2026-09-29T12:00:00Z"), endedAt: new Date("2026-09-29T13:30:00Z"), taskId: 7, taskTitle: "Login" },
      { status: "WORKING" as const, startedAt: new Date("2026-09-29T13:30:00Z"), endedAt: new Date("2026-09-29T14:00:00Z"), taskId: null, taskTitle: "Old deleted task" },
    ];
    assert.deepEqual(
      workedByTask(rows, undefined, undefined).map(({ title, ms }) => ({ title, ms })),
      [
        { title: "Login", ms: 3.5 * HOUR },
        { title: "Old deleted task", ms: 0.5 * HOUR },
        { title: null, ms: 1 * HOUR },
      ]
    );
  });
});
