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

  it("keeps committed targets when backup cleanup fails", () => {
    const directory = makeTempDirectory();
    const first = path.join(directory, "first.json");
    const second = path.join(directory, "second.json");
    fs.writeFileSync(first, "old first");
    fs.writeFileSync(second, "old second");
    const realRmSync = fs.rmSync;
    let backupRemovals = 0;
    vi.spyOn(fs, "rmSync").mockImplementation((target, options) => {
      if (String(target).endsWith(".bak")) {
        backupRemovals += 1;
        if (backupRemovals === 2) throw new Error("injected cleanup failure");
      }
      return realRmSync(target, options);
    });

    writeArtifacts({ [first]: "new first", [second]: "new second" });

    expect(readFiles([first, second])).toEqual([
      [first, "new first"],
      [second, "new second"],
    ]);
    expect(fs.existsSync(`${second}.bak`)).toBe(true);
  });

  it("retains failed rollback cleanup and rethrows the commit error", () => {
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
    const realRmSync = fs.rmSync;
    vi.spyOn(fs, "rmSync").mockImplementation((target, options) => {
      if (target === first) throw new Error("injected rollback cleanup failure");
      return realRmSync(target, options);
    });

    expect(() =>
      writeArtifacts({ [first]: "new first", [second]: "new second" })
    ).toThrow("injected commit failure");

    expect(fs.readFileSync(first, "utf8")).toBe("new first");
    expect(fs.readFileSync(`${first}.bak`, "utf8")).toBe("old first");
    expect(fs.readFileSync(second, "utf8")).toBe("old second");
  });

  it("retains a backup when rollback rename fails", () => {
    const directory = makeTempDirectory();
    const target = path.join(directory, "target.json");
    fs.writeFileSync(target, "old");
    const realRenameSync = fs.renameSync;
    vi.spyOn(fs, "renameSync").mockImplementation((source, destination) => {
      if (source === `${target}.tmp` && destination === target) {
        throw new Error("injected commit failure");
      }
      if (source === `${target}.bak` && destination === target) {
        throw new Error("injected rollback rename failure");
      }
      return realRenameSync(source, destination);
    });

    expect(() => writeArtifacts({ [target]: "new" })).toThrow(
      "injected commit failure"
    );

    expect(fs.existsSync(`${target}.bak`)).toBe(true);
    expect(fs.readFileSync(`${target}.bak`, "utf8")).toBe("old");
  });

  it("commits by direct write when Windows holds the target open", () => {
    const directory = makeTempDirectory();
    const target = path.join(directory, "target.json");
    fs.writeFileSync(target, "old");
    const realRenameSync = fs.renameSync;
    vi.spyOn(fs, "renameSync").mockImplementation(() => {
      const error = new Error("injected access denied") as NodeJS.ErrnoException;
      error.code = "EPERM";
      throw error;
    });
    void realRenameSync;

    writeArtifacts({ [target]: "new" });

    expect(fs.readFileSync(target, "utf8")).toBe("new");
    expect(fs.existsSync(`${target}.tmp`)).toBe(false);
    expect(fs.existsSync(`${target}.bak`)).toBe(false);
  });

  it("restores previous contents on rollback when no backup file exists", () => {
    const directory = makeTempDirectory();
    const first = path.join(directory, "first.json");
    const second = path.join(directory, "second.json");
    fs.writeFileSync(first, "old first");
    fs.writeFileSync(second, "old second");
    const realRenameSync = fs.renameSync;
    vi.spyOn(fs, "renameSync").mockImplementation((source, destination) => {
      if (String(destination) === `${first}.bak`) {
        // Windows EPERM: the target is held open, so no backup is created.
        const denied = new Error("injected access denied") as NodeJS.ErrnoException;
        denied.code = "EPERM";
        throw denied;
      }
      if (String(source) === `${second}.tmp`) {
        throw new Error("injected commit failure");
      }
      return realRenameSync(source, destination);
    });

    expect(() =>
      writeArtifacts({ [first]: "new first", [second]: "new second" })
    ).toThrow("injected commit failure");

    expect(fs.readFileSync(first, "utf8")).toBe("old first");
    expect(fs.readFileSync(second, "utf8")).toBe("old second");
    expect(fs.existsSync(`${first}.tmp`)).toBe(false);
    expect(fs.existsSync(`${second}.tmp`)).toBe(false);
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
