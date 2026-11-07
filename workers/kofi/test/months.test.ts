import { describe, expect, it } from "vitest";
import { addCalendarMonths, monthKey, monthsForPayment, parseAmountPence } from "../src/months";

describe("parseAmountPence", () => {
  it("converts decimal strings to pence", () => {
    expect(parseAmountPence("5.00")).toBe(500);
    expect(parseAmountPence("0.99")).toBe(99);
    expect(parseAmountPence("12")).toBe(1200);
    expect(parseAmountPence("3.5")).toBe(350);
  });

  it("rejects non-decimal input", () => {
    expect(parseAmountPence("abc")).toBeNull();
    expect(parseAmountPence("1.234")).toBeNull();
    expect(parseAmountPence("")).toBeNull();
  });
});

describe("monthsForPayment", () => {
  it("gives one month per whole pound", () => {
    expect(monthsForPayment(100, "GBP")).toBe(1);
    expect(monthsForPayment(500, "GBP")).toBe(5);
    expect(monthsForPayment(599, "GBP")).toBe(5);
  });

  it("gives nothing under one pound", () => {
    expect(monthsForPayment(99, "GBP")).toBe(0);
  });

  it("gives nothing for other currencies", () => {
    expect(monthsForPayment(500, "USD")).toBe(0);
  });

  it("accepts lower-case GBP", () => {
    expect(monthsForPayment(200, "gbp")).toBe(2);
  });
});

describe("addCalendarMonths", () => {
  const add = (iso: string, months: number) =>
    addCalendarMonths(new Date(iso), months).toISOString();

  it("adds whole calendar months", () => {
    expect(add("2026-11-08T12:00:00.000Z", 5)).toBe("2027-04-08T12:00:00.000Z");
  });

  it("rolls over the year", () => {
    expect(add("2026-12-15T09:30:00.000Z", 2)).toBe("2027-02-15T09:30:00.000Z");
  });

  it("clamps 31 January to the end of a non-leap February", () => {
    expect(add("2027-01-31T10:00:00.000Z", 1)).toBe("2027-02-28T10:00:00.000Z");
  });

  it("clamps 31 January to the end of a leap February", () => {
    expect(add("2028-01-31T10:00:00.000Z", 1)).toBe("2028-02-29T10:00:00.000Z");
  });

  it("clamps 31 March plus one month to 30 April", () => {
    expect(add("2026-03-31T00:00:00.000Z", 1)).toBe("2026-04-30T00:00:00.000Z");
  });

  it("adds twelve months across a leap day", () => {
    expect(add("2028-02-29T00:00:00.000Z", 12)).toBe("2029-02-28T00:00:00.000Z");
  });
});

describe("monthKey", () => {
  it("formats the UTC year and month", () => {
    expect(monthKey(new Date("2026-11-30T23:59:59.000Z"))).toBe("2026-11");
    expect(monthKey(new Date("2027-01-01T00:00:00.000Z"))).toBe("2027-01");
  });
});
