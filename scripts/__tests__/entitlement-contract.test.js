import assert from "node:assert/strict";
import { test } from "node:test";

import {
  LIFETIME_THRESHOLD_MS,
  entitlementStatus,
  grantsAccess,
  isSafeUid,
} from "../entitlement-contract.mjs";

const now = Date.UTC(2026, 10, 16);

test("classifies entitlement documents", () => {
  assert.deepEqual(entitlementStatus(null, now), { kind: "none" });
  assert.deepEqual(entitlementStatus({ premium: false, expiresAtMs: null }, now), { kind: "none" });
  assert.deepEqual(entitlementStatus({ premium: true, expiresAtMs: null }, now), { kind: "lifetime" });
  assert.deepEqual(entitlementStatus({ premium: true, expiresAtMs: LIFETIME_THRESHOLD_MS + 1 }, now), {
    kind: "lifetime",
  });
  assert.deepEqual(entitlementStatus({ premium: true, expiresAtMs: now }, now), { kind: "expired" });
  assert.deepEqual(entitlementStatus({ premium: true, expiresAtMs: now + 1 }, now), {
    kind: "active",
    expiresAtMs: now + 1,
  });
  assert.deepEqual(entitlementStatus({ premium: true, expiresAtMs: Number.NaN }, now), { kind: "expired" });
});

test("only lifetime and active grant access", () => {
  assert.equal(grantsAccess({ kind: "lifetime" }), true);
  assert.equal(grantsAccess({ kind: "active", expiresAtMs: now + 1 }), true);
  assert.equal(grantsAccess({ kind: "expired" }), false);
  assert.equal(grantsAccess({ kind: "none" }), false);
});

test("accepts only single-segment uids", () => {
  assert.equal(isSafeUid("aB3_x-9"), true);
  assert.equal(isSafeUid("a/b"), false);
  assert.equal(isSafeUid(""), false);
  assert.equal(isSafeUid("a".repeat(129)), false);
  assert.equal(isSafeUid(42), false);
});
