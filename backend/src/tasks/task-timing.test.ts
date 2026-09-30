import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inProgressSince, progressMs } from "./task-timing";

const MINUTE = 60_000;

describe("progressMs", () => {
  const now = new Date("2026-09-30T12:00:00Z");

  it("adds every stretch the task spent in progress", () => {
    const segments = [
      { startedAt: new Date("2026-09-29T09:00:00Z"), endedAt: new Date("2026-09-29T10:30:00Z") },
      { startedAt: new Date("2026-09-29T14:00:00Z"), endedAt: new Date("2026-09-29T14:45:00Z") },
    ];
    assert.equal(progressMs(segments, now), 135 * MINUTE);
  });

  it("counts the open stretch up to now", () => {
    const segments = [
      { startedAt: new Date("2026-09-30T09:00:00Z"), endedAt: new Date("2026-09-30T10:00:00Z") },
      { startedAt: new Date("2026-09-30T11:30:00Z"), endedAt: null },
    ];
    assert.equal(progressMs(segments, now), 90 * MINUTE);
    assert.deepEqual(inProgressSince(segments), new Date("2026-09-30T11:30:00Z"));
  });

  it("is zero for a task that never started", () => {
    assert.equal(progressMs([], now), 0);
    assert.equal(inProgressSince([]), null);
  });
});
