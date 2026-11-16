import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { ENTITLEMENT_COLLECTION } from "../entitlement-contract.mjs";

const rules = readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8");

test("firestore.rules guards the collection the contract names", () => {
  assert.match(rules, new RegExp(`match /${ENTITLEMENT_COLLECTION}/\\{uid\\}`));
  assert.match(rules, new RegExp(`documents/${ENTITLEMENT_COLLECTION}/\\$\\(request\\.auth\\.uid\\)`));
});

test("firestore.rules reads the contract's fields and has no uid pattern or lifetime constant of its own", () => {
  for (const field of ["premium", "expiresAt"]) assert.match(rules, new RegExp(`\\b${field}\\b`));
  // The rules never validate the shape of a uid, and lifetime is an absent or null expiresAt there,
  // so there is nothing to drift from UID_PATTERN or LIFETIME_THRESHOLD_MS.
  assert.doesNotMatch(rules, /\.matches\([^)]*uid/);
  assert.doesNotMatch(rules, /2100|4102444800/);
});

test("firebase.json points at firestore.rules", () => {
  const config = JSON.parse(readFileSync(new URL("../../firebase.json", import.meta.url), "utf8"));
  assert.equal(config.firestore?.rules, "firestore.rules");
});
