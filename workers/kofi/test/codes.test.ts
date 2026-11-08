import { describe, expect, it } from "vitest";
import { extractCode } from "../src/codes";

describe("extractCode", () => {
  it("finds a code inside a message", () => {
    expect(extractCode("Love the site! PD-ABC123 cheers")).toBe("PD-ABC123");
  });

  it("returns null when there is no code", () => {
    expect(extractCode("Love the site")).toBeNull();
  });

  it("ignores codes of the wrong length", () => {
    expect(extractCode("PD-ABC12")).toBeNull();
    expect(extractCode("PD-ABC1234")).toBeNull();
  });

  it("ignores lower-case codes", () => {
    expect(extractCode("pd-abc123")).toBeNull();
  });

  it("ignores a code glued to a preceding letter or digit", () => {
    expect(extractCode("XPD-ABC123")).toBeNull();
    expect(extractCode("9PD-ABC123")).toBeNull();
  });

  it("accepts a code after punctuation or at the start", () => {
    expect(extractCode("(PD-ABC123)")).toBe("PD-ABC123");
    expect(extractCode("PD-ABC123")).toBe("PD-ABC123");
    expect(extractCode("code:PD-ABC123")).toBe("PD-ABC123");
  });

  it("skips a glued code and finds a later clean one", () => {
    expect(extractCode("XPD-AAAAAA PD-BBBBBB")).toBe("PD-BBBBBB");
  });

  it("returns the first code when several appear", () => {
    expect(extractCode("PD-AAAAAA and PD-BBBBBB")).toBe("PD-AAAAAA");
  });
});
