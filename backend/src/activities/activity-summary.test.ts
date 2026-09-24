import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { teamTaskTimes, type TeamTimeRow } from "./activity-summary";

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
