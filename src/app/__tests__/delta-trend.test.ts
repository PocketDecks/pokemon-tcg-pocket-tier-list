import { describe, expect, it } from "vitest";
import { DELTA_EPSILON, deltaTrend } from "../delta-trend";

describe("deltaTrend", () => {
  it.each([
    [null, "flat"],
    [0, "flat"],
    [0.0001482010948445009, "flat"],
    [-0.0004946830944199936, "flat"],
    [DELTA_EPSILON, "flat"],
    [-DELTA_EPSILON, "flat"],
    [0.002, "up"],
    [-0.002, "down"],
  ] as const)("returns %s for delta %s", (delta, expected) => {
    expect(deltaTrend(delta)).toBe(expected);
  });
});