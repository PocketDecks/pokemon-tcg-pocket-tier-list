import { describe, expect, it } from "vitest";
import { formatTrendDay } from "../format-trend-day";

describe("formatTrendDay", () => {
  it("keeps date-only values on their source calendar date", () => {
    expect(formatTrendDay("2026-01-02", "en-GB")).toBe("2 Jan");
  });

  it("keeps invalid values unchanged", () => {
    expect(formatTrendDay("not-a-date", "en-GB")).toBe("not-a-date");
  });
});
