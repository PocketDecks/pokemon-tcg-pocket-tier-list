import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { DEFAULT_URL, parseGrantArgs, resolveUserPath, UsageError } from "../scripts/grant-args";

const base = ["--payment", "txn-1-msg-1", "--uid", "uid123", "--key", "key.json"];
const remote = ["--payment", "p1", "--uid", "u1", "--token-file", "t.txt"];

describe("parseGrantArgs", () => {
  it("parses the required flags", () => {
    expect(parseGrantArgs(base)).toEqual({
      help: false,
      paymentId: "txn-1-msg-1",
      uid: "uid123",
      keyPath: "key.json",
      url: DEFAULT_URL,
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

  it("parses the remote mode with an email", () => {
    expect(
      parseGrantArgs(["--payment", "p1", "--email", "a@b.co", "--token-file", "t.txt"]),
    ).toEqual({
      help: false,
      paymentId: "p1",
      email: "a@b.co",
      tokenFile: "t.txt",
      url: DEFAULT_URL,
      months: undefined,
      dryRun: false,
    });
  });

  it("defaults the url to the live Worker", () => {
    expect(DEFAULT_URL).toBe("https://pocketdecks-kofi.pocketdecks.workers.dev");
  });

  it("accepts a custom url and strips a trailing slash", () => {
    expect(parseGrantArgs([...remote, "--url", "https://example.test/"]).url).toBe(
      "https://example.test",
    );
    expect(parseGrantArgs([...remote, "--url", "http://localhost:8787"]).url).toBe(
      "http://localhost:8787",
    );
  });

  it.each(["http://example.test", "ftp://example.test", "not a url", "https://"])(
    "rejects --url %j",
    (value) => {
      expect(() => parseGrantArgs([...remote, "--url", value])).toThrow(UsageError);
    },
  );

  it("accepts --email in key mode", () => {
    expect(
      parseGrantArgs(["--payment", "p1", "--email", "a@b.co", "--key", "key.json"]),
    ).toMatchObject({ email: "a@b.co", keyPath: "key.json" });
  });

  it("rejects both or neither of --uid and --email", () => {
    expect(() => parseGrantArgs([...base, "--email", "a@b.co"])).toThrow(UsageError);
    expect(() => parseGrantArgs(["--payment", "p1", "--key", "key.json"])).toThrow(UsageError);
  });

  it("rejects both or neither of --key and --token-file", () => {
    expect(() => parseGrantArgs([...base, "--token-file", "t.txt"])).toThrow(UsageError);
    expect(() => parseGrantArgs(["--payment", "p1", "--uid", "u1"])).toThrow(UsageError);
  });

  it("rejects --url in key mode", () => {
    expect(() => parseGrantArgs([...base, "--url", "https://example.test"])).toThrow(UsageError);
  });
});

describe("resolveUserPath", () => {
  it("resolves a relative path from the folder yarn was started in", () => {
    expect(resolveUserPath("private/token", { INIT_CWD: "/repo" }, "/repo/workers/kofi")).toBe(
      resolve("/repo", "private/token"),
    );
  });

  it("falls back to the current folder without INIT_CWD", () => {
    expect(resolveUserPath("token", {}, "/somewhere")).toBe(resolve("/somewhere", "token"));
  });

  it("keeps an absolute path as it is", () => {
    const absolute = resolve("/keys/token");
    expect(resolveUserPath(absolute, { INIT_CWD: "/repo" }, "/x")).toBe(absolute);
  });
});
