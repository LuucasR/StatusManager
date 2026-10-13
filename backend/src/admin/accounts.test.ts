import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { accountStatus } from "./accounts";

describe("accountStatus", () => {
  it("an active account is ACTIVE", () => {
    assert.equal(accountStatus({ active: true, deactivatedAt: null }), "ACTIVE");
  });

  it("an inactive account never deactivated is a pending sign-up", () => {
    assert.equal(accountStatus({ active: false, deactivatedAt: null }), "PENDING");
  });

  it("an inactive account with deactivatedAt is DEACTIVATED, not pending", () => {
    assert.equal(accountStatus({ active: false, deactivatedAt: new Date() }), "DEACTIVATED");
  });
});
