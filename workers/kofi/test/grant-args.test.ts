import { describe, expect, it } from "vitest";
import { parseGrantArgs, UsageError } from "../scripts/grant-args";

const base = ["--payment", "txn-1-msg-1", "--uid", "uid123", "--key", "key.json"];

describe("parseGrantArgs", () => {
  it("parses the required flags", () => {
    expect(parseGrantArgs(base)).toEqual({
      help: false,
      paymentId: "txn-1-msg-1",
      uid: "uid123",
      keyPath: "key.json",
      months: undefined,
      dryRun: false,
    });
  });

  it("parses months and dry run", () => {
    expect(parseGrantArgs([...base, "--months", "12", "--dry-run"])).toMatchObject({
      months: 12,
      dryRun: true,
    });
  });

  it("returns help without needing the other flags", () => {
    expect(parseGrantArgs(["--help"]).help).toBe(true);
  });

  it.each(["--payment", "--uid", "--key"])("requires %s", (flag) => {
    const argv = [...base];
    argv.splice(argv.indexOf(flag), 2);
    expect(() => parseGrantArgs(argv)).toThrow(UsageError);
  });

  it("rejects an empty argument list", () => {
    expect(() => parseGrantArgs([])).toThrow(UsageError);
  });

  it.each(["0", "121", "1.5", "abc", "", "-3", "1e1"])("rejects --months %j", (value) => {
    expect(() => parseGrantArgs([...base, "--months", value])).toThrow(UsageError);
  });

  it("rejects unknown flags and positional arguments", () => {
    expect(() => parseGrantArgs([...base, "--force"])).toThrow(UsageError);
    expect(() => parseGrantArgs([...base, "extra"])).toThrow(UsageError);
  });

  it("rejects a flag with no value", () => {
    expect(() => parseGrantArgs(["--payment", "p", "--uid", "u", "--key"])).toThrow(UsageError);
  });
});
