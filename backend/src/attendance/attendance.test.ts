import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatTimeOfDay,
  halfOf,
  halvesOf,
  isMonth,
  lateMinutes,
  summarize,
  weekdayOf,
} from "./attendance";

const tolerances = { lateToleranceFirstHalfMinutes: 25, lateToleranceSecondHalfMinutes: 25 };

describe("halves of the month", () => {
  it("puts the 15th in the first half and the 16th in the second", () => {
    assert.equal(halfOf("2026-09-01"), 1);
    assert.equal(halfOf("2026-09-15"), 1);
    assert.equal(halfOf("2026-09-16"), 2);
    assert.equal(halfOf("2026-09-30"), 2);
  });

  it("ends the second half on the month's real last day", () => {
    assert.equal(halvesOf("2026-02").second.to, "2026-02-28");
    assert.equal(halvesOf("2028-02").second.to, "2028-02-29");
    assert.equal(halvesOf("2026-12").second.to, "2026-12-31");
    assert.equal(halvesOf("2026-09").first.to, "2026-09-15");
  });

  it("validates the month", () => {
    assert.equal(isMonth("2026-09"), true);
    assert.equal(isMonth("2026-13"), false);
    assert.equal(isMonth("2026-9"), false);
  });
});

describe("lateMinutes", () => {
  it("counts minutes after the start", () => {
    assert.equal(lateMinutes("09:20", 9 * 60), 20);
  });

  it("is zero when early or on time", () => {
    assert.equal(lateMinutes("08:50", 9 * 60), 0);
    assert.equal(lateMinutes("09:00", 9 * 60), 0);
  });

  it("is zero when either time is unusable", () => {
    assert.equal(lateMinutes("nope", 9 * 60), 0);
    assert.equal(lateMinutes("09:30", null), 0);
  });
});

describe("summarize", () => {
  it("adds late minutes into a budget per half", () => {
    const summary = summarize(
      [
        { employeeId: 1, date: "2026-09-02", lateMinutes: 20 },
        { employeeId: 1, date: "2026-09-10", lateMinutes: 10 },
        { employeeId: 1, date: "2026-09-11", lateMinutes: 0 },
        { employeeId: 1, date: "2026-09-16", lateMinutes: 25 },
      ],
      [1],
      tolerances
    ).get(1)!;

    assert.deepEqual(summary.first, { lateMinutes: 30, lateDays: 2, tolerance: 25, exceeded: true });
    // Spending the allowance exactly is still within it.
    assert.deepEqual(summary.second, { lateMinutes: 25, lateDays: 1, tolerance: 25, exceeded: false });
  });

  it("judges each half by its own tolerance", () => {
    const summary = summarize(
      [{ employeeId: 1, date: "2026-09-20", lateMinutes: 30 }],
      [1],
      { lateToleranceFirstHalfMinutes: 25, lateToleranceSecondHalfMinutes: 40 }
    ).get(1)!;
    assert.equal(summary.second.exceeded, false);
    assert.equal(summary.first.tolerance, 25);
  });

  it("lists employees with no entries as clean", () => {
    const summary = summarize([], [7], tolerances).get(7)!;
    assert.equal(summary.first.lateMinutes, 0);
    assert.equal(summary.second.exceeded, false);
  });
});

describe("helpers", () => {
  it("reads the weekday of a calendar day", () => {
    assert.equal(weekdayOf("2026-09-15"), 2);
    assert.equal(weekdayOf("2026-09-13"), 0);
  });

  it("formats minutes as HH:MM", () => {
    assert.equal(formatTimeOfDay(9 * 60 + 5), "09:05");
  });
});
