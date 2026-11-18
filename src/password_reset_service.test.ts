import assert from "node:assert/strict";
import test from "node:test";
import { decideResetChannel } from "./password_reset_service.ts";

test("a consented donor receives the email reset route", () => {
  assert.equal(decideResetChannel({ email: "donor@example.org", hasConsent: true }), "email");
  assert.equal(decideResetChannel({ email: "donor@example.org", hasConsent: false }), "manual-review");
});
