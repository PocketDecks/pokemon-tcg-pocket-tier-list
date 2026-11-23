import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { FEEDBACK_THROTTLE_MS } from "../feedback";

const rules = readFileSync(resolve(process.cwd(), "firestore.rules"), "utf8");

const UNIT_MS = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
} as const;

describe("feedback throttle hour", () => {
  it("matches the duration in the Firestore rules", () => {
    const match = /duration\.value\((\d+),\s*'([smhd])'\)/.exec(rules);
    if (!match) throw new Error("firestore.rules has no throttle duration");

    const [, amount, unit] = match;
    const ruleMs = Number(amount) * UNIT_MS[unit as keyof typeof UNIT_MS];
    expect(ruleMs).toBe(FEEDBACK_THROTTLE_MS);
  });
});
