import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { writeArtifacts } from "../utils/write-artifacts";

const tempDirectories: string[] = [];

const makeTempDirectory = () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "write-artifacts-"));
  tempDirectories.push(directory);
  return directory;
};

const readFiles = (files: string[]) =>
  files.map((file) => [file, fs.readFileSync(file, "utf8")] as const);

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of tempDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("writeArtifacts", () => {
  it("replaces both files and leaves only targets", () => {
    const directory = makeTempDirectory();
    const first = path.join(directory, "first.json");
    const second = path.join(directory, "second.json");
    fs.writeFileSync(first, "old first");
    fs.writeFileSync(second, "old second");

    writeArtifacts({ [first]: "new first", [second]: "new second" });

    expect(readFiles([first, second])).toEqual([
      [first, "new first"],
      [second, "new second"],
    ]);
    expect(fs.readdirSync(directory).sort()).toEqual(["first.json", "second.json"]);
  });

  it("restores both old contents after a committed rename fails", () => {
    const directory = makeTempDirectory();
    const first = path.join(directory, "first.json");
    const second = path.join(directory, "second.json");
    fs.writeFileSync(first, "old first");
    fs.writeFileSync(second, "old second");
    const realRenameSync = fs.renameSync;
    vi.spyOn(fs, "renameSync").mockImplementation((source, target) => {
      if (source === `${second}.tmp` && target === second) {
        throw new Error("injected commit failure");
      }
      return realRenameSync(source, target);
    });

    expect(() =>
      writeArtifacts({ [first]: "new first", [second]: "new second" })
    ).toThrow("injected commit failure");

    expect(readFiles([first, second])).toEqual([
      [first, "old first"],
      [second, "old second"],
    ]);
    expect(fs.readdirSync(directory).sort()).toEqual(["first.json", "second.json"]);
  });

  it("refuses stale staging files without changing the target", () => {
    const directory = makeTempDirectory();
    const target = path.join(directory, "target.json");
    fs.writeFileSync(target, "old");
    fs.writeFileSync(`${target}.tmp`, "stale");

    expect(() => writeArtifacts({ [target]: "new" })).toThrow(/stale staging/i);

    expect(fs.readFileSync(target, "utf8")).toBe("old");
    expect(fs.readFileSync(`${target}.tmp`, "utf8")).toBe("stale");
    expect(fs.readdirSync(directory).sort()).toEqual(["target.json", "target.json.tmp"]);
  });
});
