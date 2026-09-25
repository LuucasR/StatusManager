import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { summarize } from "../attendance/attendance";
import { decideLateWarning, lateWarningReason } from "./late-warning";

const tolerances = { lateToleranceFirstHalfMinutes: 25, lateToleranceSecondHalfMinutes: 25 };

const active = { revokedAt: null, revokedBySystem: false };
const revokedBySystem = { revokedAt: new Date(), revokedBySystem: true };
const revokedByAdmin = { revokedAt: new Date(), revokedBySystem: false };

describe("decideLateWarning", () => {
  it("creates one the first time the half goes over", () => {
    assert.equal(decideLateWarning(true, null), "create");
  });

  it("does nothing while the half is within the allowance", () => {
    assert.equal(decideLateWarning(false, null), "none");
  });

  it("only refreshes the numbers while it stays over", () => {
    assert.equal(decideLateWarning(true, active), "update");
  });

  it("revokes it on its own when a correction brings the half back", () => {
    assert.equal(decideLateWarning(false, active), "autoRevoke");
  });

  it("brings back one the system revoked when the half goes over again", () => {
    assert.equal(decideLateWarning(true, revokedBySystem), "reactivate");
  });

  it("never brings back one an admin revoked", () => {
    assert.equal(decideLateWarning(true, revokedByAdmin), "none");
    assert.equal(decideLateWarning(false, revokedByAdmin), "none");
  });

  it("leaves an already revoked one alone while the half stays within", () => {
    assert.equal(decideLateWarning(false, revokedBySystem), "none");
  });
});

describe("the allowance boundary", () => {
  const exceeded = (minutes: number[]) =>
    summarize(
      minutes.map((lateMinutes, index) => ({
        employeeId: 1,
        date: `2026-09-0${index + 1}`,
        lateMinutes,
      })),
      [1],
      tolerances
    ).get(1)!.first.exceeded;

  it("spending exactly the allowance is not a warning", () => {
    assert.equal(decideLateWarning(exceeded([10, 15]), null), "none");
  });

  it("one minute over is", () => {
    assert.equal(decideLateWarning(exceeded([10, 16]), null), "create");
  });
});

describe("lateWarningReason", () => {
  it("names the half and the numbers", () => {
    assert.equal(
      lateWarningReason("2026-09", 2, 31, 25),
      "31 late minutes in 2026-09 (16-end), over the 25-minute allowance"
    );
  });
});
