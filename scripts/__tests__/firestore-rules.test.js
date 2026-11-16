import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// What the rules allow is tested against the emulator in scripts/rules/.
test("firebase.json points at firestore.rules", () => {
  const config = JSON.parse(readFileSync(new URL("../../firebase.json", import.meta.url), "utf8"));
  assert.equal(config.firestore?.rules, "firestore.rules");
});
