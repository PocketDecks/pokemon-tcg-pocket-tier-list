import { describe, expect, it } from "vitest";
import { tokensMatch } from "../src/token";

describe("tokensMatch", () => {
  it("accepts equal tokens", () => {
    expect(tokensMatch("abc-123", "abc-123")).toBe(true);
  });

  it("rejects different tokens of the same length", () => {
    expect(tokensMatch("abc-123", "abc-124")).toBe(false);
  });

  it("rejects different lengths", () => {
    expect(tokensMatch("abc", "abcd")).toBe(false);
    expect(tokensMatch("abcd", "abc")).toBe(false);
  });

  it("rejects an empty expected token", () => {
    expect(tokensMatch("", "")).toBe(false);
  });
});
