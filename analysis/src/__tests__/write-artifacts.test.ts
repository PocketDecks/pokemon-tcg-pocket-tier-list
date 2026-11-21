import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { writeArtefacts } from "../utils/write-artifacts";

const tempDirectories: string[] = [];

const makeTempDirectory = () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "write-artefacts-"));
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

describe("writeArtefacts", () => {
  it("replaces both files and leaves only targets", () => {
    const directory = makeTempDirectory();
    const first = path.join(directory, "first.json");
    const second = path.join(directory, "second.json");
    fs.writeFileSync(first, "old first");
    fs.writeFileSync(second, "old second");

    writeArtefacts({ [first]: "new first", [second]: "new second" });

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
      writeArtefacts({ [first]: "new first", [second]: "new second" })
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

    writeArtefacts({ [first]: "new first", [second]: "new second" });

    expect(readFiles([first, second])).toEqual([
      [first, "new first"],
      [second, "new second"],
    ]);
    expect(fs.existsSync(`${second}.bak`)).toBe(true);
  });

  it("retains failed rollback cleanup and reports its location", () => {
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

    let failure: unknown;
    try {
      writeArtefacts({ [first]: "new first", [second]: "new second" });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toContain("injected commit failure");
    expect((failure as Error).message).toContain(`rollback failed for ${first}`);
    expect((failure as Error).message).toContain("commit completion is unknown");
    expect((failure as Error).message).toContain("do not restore or delete staging files");
    expect(fs.readFileSync(first, "utf8")).toBe("new first");
    expect(fs.readFileSync(`${first}.bak`, "utf8")).toBe("old first");
    expect(fs.readFileSync(second, "utf8")).toBe("old second");
  });

  it("retains a backup and reports its path when rollback rename fails", () => {
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

    let failure: unknown;
    try {
      writeArtefacts({ [target]: "new" });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toContain("injected commit failure");
    expect((failure as Error).message).toContain(`rollback failed for ${target}`);
    expect((failure as Error).message).toContain("commit completion is unknown");
    expect((failure as Error).message).toContain("do not restore or delete staging files");
    expect(fs.existsSync(`${target}.bak`)).toBe(true);
    expect(fs.readFileSync(`${target}.bak`, "utf8")).toBe("old");
  });

  it("restores a single target when the completion marker cannot be created", () => {
    const directory = makeTempDirectory();
    const target = path.join(directory, "target.json");
    const marker = `${target}.committed`;
    fs.writeFileSync(target, "old");
    const realWriteFileSync = fs.writeFileSync;
    let stateAtFailure: { target: string; backup: string; marker: string | null } | undefined;
    vi.spyOn(fs, "writeFileSync").mockImplementation((file, data, options) => {
      if (file === marker) {
        stateAtFailure = {
          target: fs.readFileSync(target, "utf8"),
          backup: fs.readFileSync(`${target}.bak`, "utf8"),
          marker: fs.existsSync(marker) ? fs.readFileSync(marker, "utf8") : null,
        };
        throw new Error("injected marker creation failure");
      }
      return realWriteFileSync(file, data, options);
    });

    expect(() => writeArtefacts({ [target]: "new" })).toThrow("injected marker creation failure");

    expect(stateAtFailure).toEqual({ target: "new", backup: "old", marker: null });
    expect(fs.readFileSync(target, "utf8")).toBe("old");
    expect(fs.existsSync(`${target}.bak`)).toBe(false);
    expect(fs.existsSync(`${target}.tmp`)).toBe(false);
    expect(fs.existsSync(marker)).toBe(false);
  });

  it("restores multiple targets after a partial completion marker write", () => {
    const directory = makeTempDirectory();
    const first = path.join(directory, "first.json");
    const second = path.join(directory, "second.json");
    const marker = `${first}.committed`;
    fs.writeFileSync(first, "old first");
    fs.writeFileSync(second, "old second");
    const realWriteFileSync = fs.writeFileSync;
    let stateAtFailure:
      | { first: string; firstBackup: string; second: string; secondBackup: string; marker: string }
      | undefined;
    vi.spyOn(fs, "writeFileSync").mockImplementation((file, data, options) => {
      if (file === marker) {
        realWriteFileSync(file, "partial marker", options);
        stateAtFailure = {
          first: fs.readFileSync(first, "utf8"),
          firstBackup: fs.readFileSync(`${first}.bak`, "utf8"),
          second: fs.readFileSync(second, "utf8"),
          secondBackup: fs.readFileSync(`${second}.bak`, "utf8"),
          marker: fs.readFileSync(marker, "utf8"),
        };
        throw new Error("injected partial marker failure");
      }
      return realWriteFileSync(file, data, options);
    });

    expect(() => writeArtefacts({ [first]: "new first", [second]: "new second" })).toThrow(
      "injected partial marker failure"
    );

    expect(stateAtFailure).toEqual({
      first: "new first",
      firstBackup: "old first",
      second: "new second",
      secondBackup: "old second",
      marker: "partial marker",
    });
    expect(readFiles([first, second])).toEqual([
      [first, "old first"],
      [second, "old second"],
    ]);
    expect(fs.existsSync(`${first}.bak`)).toBe(false);
    expect(fs.existsSync(`${second}.bak`)).toBe(false);
    expect(fs.existsSync(`${first}.tmp`)).toBe(false);
    expect(fs.existsSync(`${second}.tmp`)).toBe(false);
    expect(fs.existsSync(marker)).toBe(false);
  });

  it("reports installed targets when a partial completion marker cannot be removed", () => {
    const directory = makeTempDirectory();
    const target = path.join(directory, "target.json");
    const marker = `${target}.committed`;
    fs.writeFileSync(target, "old");
    const realWriteFileSync = fs.writeFileSync;
    vi.spyOn(fs, "writeFileSync").mockImplementation((file, data, options) => {
      if (file === marker) {
        realWriteFileSync(file, "partial marker", options);
        throw new Error("injected marker write failure");
      }
      return realWriteFileSync(file, data, options);
    });
    const realRmSync = fs.rmSync;
    vi.spyOn(fs, "rmSync").mockImplementation((file, options) => {
      if (file === marker) throw new Error("injected marker cleanup failure");
      return realRmSync(file, options);
    });

    let failure: unknown;
    try {
      writeArtefacts({ [target]: "new" });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toContain(`could not remove completion marker ${marker}`);
    expect((failure as Error).message).toContain("targets remain installed");
    expect((failure as Error).message).toContain("commit completion is unknown");
    expect((failure as Error).message).toContain("do not restore or delete staging files");
    expect(fs.readFileSync(target, "utf8")).toBe("new");
    expect(fs.readFileSync(`${target}.bak`, "utf8")).toBe("old");
    expect(fs.readFileSync(marker, "utf8")).toBe("partial marker");
  });

  it("restores every target when a rollback rename needs a retry", () => {
    const directory = makeTempDirectory();
    const first = path.join(directory, "first.json");
    const second = path.join(directory, "second.json");
    fs.writeFileSync(first, "old first");
    fs.writeFileSync(second, "old second");
    const realRenameSync = fs.renameSync;
    let rollbackAttempts = 0;
    vi.spyOn(fs, "renameSync").mockImplementation((source, destination) => {
      if (source === `${second}.tmp` && destination === second) {
        throw new Error("injected commit failure");
      }
      if (source === `${second}.bak` && destination === second) {
        rollbackAttempts += 1;
        if (rollbackAttempts === 1) {
          const error = new Error("injected access denied") as NodeJS.ErrnoException;
          error.code = "EPERM";
          throw error;
        }
      }
      return realRenameSync(source, destination);
    });

    expect(() =>
      writeArtefacts({ [first]: "new first", [second]: "new second" })
    ).toThrow("injected commit failure");

    expect(readFiles([first, second])).toEqual([
      [first, "old first"],
      [second, "old second"],
    ]);
    expect(fs.readdirSync(directory).sort()).toEqual(["first.json", "second.json"]);
  });

  it("commits by direct write when Windows holds the target open", () => {
    const directory = makeTempDirectory();
    const target = path.join(directory, "target.json");
    fs.writeFileSync(target, "old");
    const realRenameSync = fs.renameSync;
    vi.spyOn(fs, "renameSync").mockImplementation((source, destination) => {
      if (source === `${target}.tmp` && destination === target) {
        const error = new Error("injected access denied") as NodeJS.ErrnoException;
        error.code = "EPERM";
        throw error;
      }
      return realRenameSync(source, destination);
    });

    writeArtefacts({ [target]: "new" });

    expect(fs.readFileSync(target, "utf8")).toBe("new");
    expect(fs.existsSync(`${target}.tmp`)).toBe(false);
    expect(fs.existsSync(`${target}.bak`)).toBe(false);
  });

  it("retains staging when the backup rename fails", () => {
    const directory = makeTempDirectory();
    const target = path.join(directory, "target.json");
    fs.writeFileSync(target, "old");
    const realRenameSync = fs.renameSync;
    const realWriteFileSync = fs.writeFileSync;
    const targetWrites: string[] = [];
    vi.spyOn(fs, "writeFileSync").mockImplementation((file, data, options) => {
      if (file === target) targetWrites.push(String(data));
      return realWriteFileSync(file, data, options);
    });
    vi.spyOn(fs, "renameSync").mockImplementation((source, destination) => {
      if (source === target && destination === `${target}.bak`) {
        const error = new Error("injected access denied") as NodeJS.ErrnoException;
        error.code = "EPERM";
        throw error;
      }
      return realRenameSync(source, destination);
    });

    expect(() => writeArtefacts({ [target]: "new" })).toThrow(
      "injected access denied"
    );

    expect(targetWrites).toEqual([]);
    expect(fs.readFileSync(target, "utf8")).toBe("old");
    expect(fs.existsSync(`${target}.tmp`)).toBe(true);
    expect(fs.existsSync(`${target}.bak`)).toBe(false);
  });

  it("restores previous contents when direct-write staging cleanup fails", () => {
    const directory = makeTempDirectory();
    const target = path.join(directory, "target.json");
    fs.writeFileSync(target, "old");
    const realRenameSync = fs.renameSync;
    vi.spyOn(fs, "renameSync").mockImplementation((source, destination) => {
      if (source === `${target}.tmp` && destination === target) {
        const error = new Error("injected access denied") as NodeJS.ErrnoException;
        error.code = "EPERM";
        throw error;
      }
      return realRenameSync(source, destination);
    });
    const realRmSync = fs.rmSync;
    vi.spyOn(fs, "rmSync").mockImplementation((targetPath, options) => {
      if (targetPath === `${target}.tmp`) {
        throw new Error("injected staging cleanup failure");
      }
      return realRmSync(targetPath, options);
    });

    expect(() => writeArtefacts({ [target]: "new" })).toThrow(
      "injected staging cleanup failure"
    );

    expect(fs.readFileSync(target, "utf8")).toBe("old");
    expect(fs.existsSync(`${target}.tmp`)).toBe(true);
  });


  it("refuses stale staging files without changing the target", () => {
    const directory = makeTempDirectory();
    const target = path.join(directory, "target.json");
    fs.writeFileSync(target, "old");
    fs.writeFileSync(`${target}.tmp`, "stale");

    expect(() => writeArtefacts({ [target]: "new" })).toThrow(/stale staging/i);

    expect(fs.readFileSync(target, "utf8")).toBe("old");
    expect(fs.readFileSync(`${target}.tmp`, "utf8")).toBe("stale");
    expect(fs.readdirSync(directory).sort()).toEqual(["target.json", "target.json.tmp"]);
  });

  it("marks a new target while it stages and clears the mark after a successful write", () => {
    const directory = makeTempDirectory();
    const target = path.join(directory, "target.json");
    const realRenameSync = fs.renameSync;
    const marksAtSwap: boolean[] = [];
    vi.spyOn(fs, "renameSync").mockImplementation((source, destination) => {
      if (source === `${target}.tmp` && destination === target) {
        marksAtSwap.push(fs.existsSync(`${target}.created`));
      }
      return realRenameSync(source, destination);
    });

    writeArtefacts({ [target]: "new" });

    expect(marksAtSwap).toEqual([true]);
    expect(fs.readFileSync(target, "utf8")).toBe("new");
    expect(fs.readdirSync(directory).sort()).toEqual(["target.json"]);
  });

  it("removes a new target and its marker when a later swap fails", () => {
    const directory = makeTempDirectory();
    const created = path.join(directory, "created.json");
    const existing = path.join(directory, "existing.json");
    fs.writeFileSync(existing, "old");
    const realRenameSync = fs.renameSync;
    const marksAtSwap: boolean[] = [];
    vi.spyOn(fs, "renameSync").mockImplementation((source, destination) => {
      if (source === `${created}.tmp` && destination === created) {
        marksAtSwap.push(fs.existsSync(`${created}.created`));
      }
      if (source === `${existing}.tmp` && destination === existing) {
        throw new Error("injected commit failure");
      }
      return realRenameSync(source, destination);
    });

    expect(() =>
      writeArtefacts({ [created]: "new", [existing]: "newer" })
    ).toThrow("injected commit failure");

    expect(marksAtSwap).toEqual([true]);
    expect(fs.existsSync(created)).toBe(false);
    expect(fs.existsSync(`${created}.created`)).toBe(false);
    expect(fs.readFileSync(existing, "utf8")).toBe("old");
    expect(fs.readdirSync(directory).sort()).toEqual(["existing.json"]);
  });

  it("refuses a leftover marker without changing the target", () => {
    const directory = makeTempDirectory();
    const target = path.join(directory, "target.json");
    fs.writeFileSync(target, "old");
    fs.writeFileSync(`${target}.created`, "");

    expect(() => writeArtefacts({ [target]: "new" })).toThrow(/stale staging/i);

    expect(fs.readFileSync(target, "utf8")).toBe("old");
    expect(fs.existsSync(`${target}.created`)).toBe(true);
    expect(fs.readdirSync(directory).sort()).toEqual(["target.json", "target.json.created"]);
  });
});
