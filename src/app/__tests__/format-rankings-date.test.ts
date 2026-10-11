import { describe, expect, it } from "vitest";
import { formatRankingsDate, formatRankingsTimestamp } from "../format-rankings-date";

const date = new Date("2026-10-06T00:00:00.000Z");

describe("formatRankingsDate", () => {
  it("keeps the existing English wording", () => {
    expect(formatRankingsDate(date, "en")).toBe("6 October 2026");
  });

  it("formats Japanese dates for a Japanese reader", () => {
    expect(formatRankingsDate(date, "ja")).toBe("2026年10月6日");
  });

  it("formats other supported languages", () => {
    expect(formatRankingsDate(date, "de")).toBe("6. Oktober 2026");
    expect(formatRankingsDate(date, "zh-CN")).toBe("2026年10月6日");
  });

  it("does not shift the day for an evening UTC instant", () => {
    expect(formatRankingsDate(new Date("2026-10-10T23:30:00.000Z"), "en")).toBe("10 October 2026");
  });

  it("falls back to English wording for an unknown language", () => {
    expect(formatRankingsDate(date, "xx")).toBe("6 October 2026");
  });
});

describe("formatRankingsTimestamp", () => {
  const instant = new Date("2026-10-06T18:56:00.000Z");

  it("renders a localised time without an am/pm suffix", () => {
    expect(formatRankingsTimestamp(instant, "ja")).toBe("2026年10月6日 18:56");
    expect(formatRankingsTimestamp(instant, "de")).toBe("6. Oktober 2026 um 18:56");
  });

  it("keeps the English wording", () => {
    expect(formatRankingsTimestamp(instant, "en")).toBe("6 October 2026 at 18:56");
  });
});
