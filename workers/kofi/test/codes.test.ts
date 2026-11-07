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

  it("returns the first code when several appear", () => {
    expect(extractCode("PD-AAAAAA and PD-BBBBBB")).toBe("PD-AAAAAA");
  });
});
