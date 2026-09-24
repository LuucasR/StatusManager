import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addDays, currentWeekStart, isWeekStart, weekRange, weekStartOf, zonedMidnight } from "./patch-week";

const BA = "America/Argentina/Buenos_Aires";

describe("weekStartOf", () => {
  it("maps every day of the week to its Monday", () => {
    // 2026-09-21 is a Monday.
    for (let offset = 0; offset < 7; offset += 1) {
      assert.equal(weekStartOf(addDays("2026-09-21", offset)), "2026-09-21");
    }
  });

  it("puts Sunday in the week that started six days earlier", () => {
    assert.equal(weekStartOf("2026-09-27"), "2026-09-21");
  });

  it("crosses a month and a year", () => {
    assert.equal(weekStartOf("2027-01-01"), "2026-12-28");
  });
});

describe("isWeekStart", () => {
  it("accepts only real Mondays", () => {
    assert.equal(isWeekStart("2026-09-21"), true);
    assert.equal(isWeekStart("2026-09-22"), false);
    assert.equal(isWeekStart("2026-02-30"), false);
    assert.equal(isWeekStart("garbage"), false);
  });
});

describe("currentWeekStart", () => {
  it("uses the team's timezone, not UTC", () => {
    // Monday 01:30 UTC is still Sunday 22:30 in Buenos Aires.
    assert.equal(currentWeekStart(BA, new Date("2026-09-28T01:30:00Z")), "2026-09-21");
    assert.equal(currentWeekStart("UTC", new Date("2026-09-28T01:30:00Z")), "2026-09-28");
  });
});

describe("zonedMidnight", () => {
  it("returns local midnight as an instant", () => {
    assert.equal(zonedMidnight("2026-09-21", BA).toISOString(), "2026-09-21T03:00:00.000Z");
    assert.equal(zonedMidnight("2026-09-21", "UTC").toISOString(), "2026-09-21T00:00:00.000Z");
  });

  it("follows a DST change", () => {
    // Madrid moves from +01:00 to +02:00 on 2026-03-29.
    assert.equal(zonedMidnight("2026-03-23", "Europe/Madrid").toISOString(), "2026-03-22T23:00:00.000Z");
    assert.equal(zonedMidnight("2026-03-30", "Europe/Madrid").toISOString(), "2026-03-29T22:00:00.000Z");
  });
});

describe("weekRange", () => {
  it("spans seven days with an exclusive end", () => {
    const range = weekRange("2026-09-21", BA);
    assert.equal(range.from.toISOString(), "2026-09-21T03:00:00.000Z");
    assert.equal(range.to.toISOString(), "2026-09-28T03:00:00.000Z");
  });
});
