import fs from "fs";
import path from "path";
import { vi } from "vitest";
import { StoreLockBusyError, withStoreLock } from "../utils/store-lock";
import { deadPid, liveForeignPid, thrownError, useStoreLockFixture } from "./store-lock-fixture";

describe("StoreLockBusyError", () => {
  const fixture = useStoreLockFixture();

  it("marks a lock held by a live process as busy", () => {
    fs.writeFileSync(fixture.lockFile, String(liveForeignPid()));

    expect(thrownError(() => withStoreLock(fixture.store, () => "ran"))).toBeInstanceOf(StoreLockBusyError);
  });

  it("marks a claim held by a live process as busy", () => {
    const live = liveForeignPid();
    const claim = path.join(`${fixture.lockFile}.claims`, `${live}-other`);
    fs.mkdirSync(path.dirname(claim), { recursive: true });
    fs.writeFileSync(claim, String(live));

    expect(thrownError(() => withStoreLock(fixture.store, () => "ran"))).toBeInstanceOf(StoreLockBusyError);
  });

  it("marks a young claim that has not written its pid as busy", () => {
    const claim = path.join(`${fixture.lockFile}.claims`, "incomplete");
    fs.mkdirSync(path.dirname(claim), { recursive: true });
    fs.writeFileSync(claim, "");

    expect(thrownError(() => withStoreLock(fixture.store, () => "ran"))).toBeInstanceOf(StoreLockBusyError);
  });

  it("marks a lock that changes to a live pid before the reclaim re-read as busy", () => {
    const live = liveForeignPid();
    const read = fs.readFileSync;
    let reads = 0;
    fs.writeFileSync(fixture.lockFile, String(deadPid()));
    vi.spyOn(fs, "readFileSync").mockImplementation((target, options) => {
      if (String(target) === fixture.lockFile) {
        reads += 1;
        if (reads === 2) fs.writeFileSync(fixture.lockFile, String(live));
      }
      return read(target, options);
    });

    const thrown = thrownError(() => withStoreLock(fixture.store, () => "ran"));

    expect(reads).toBe(2);
    expect(thrown).toBeInstanceOf(StoreLockBusyError);
    expect((thrown as Error).message).toContain(`Store lock ${fixture.lockFile} is held by process ${live}`);
  });

  it("marks a lock that a reclaim finds held by a live pid after moving it aside as busy", () => {
    const live = liveForeignPid();
    const rename = fs.renameSync;
    fs.writeFileSync(fixture.lockFile, String(deadPid()));
    vi.spyOn(fs, "renameSync").mockImplementation((from, to) => {
      if (String(from) === fixture.lockFile) fs.writeFileSync(fixture.lockFile, String(live));
      return rename(from, to);
    });

    const thrown = thrownError(() => withStoreLock(fixture.store, () => "ran"));

    expect(thrown).toBeInstanceOf(StoreLockBusyError);
    expect((thrown as Error).message).toContain(`Store lock ${fixture.lockFile} is held by process ${live}`);
    expect(fixture.reclaimFiles()).toEqual([]);
  });

  it("marks a lock that keeps changing during acquisition as busy", () => {
    fs.writeFileSync(fixture.lockFile, String(process.pid));
    const read = fs.readFileSync;
    vi.spyOn(fs, "readFileSync").mockImplementation((target, options) => {
      if (String(target) === fixture.lockFile) {
        throw Object.assign(new Error("lock file vanished"), { code: "ENOENT" });
      }
      return read(target, options);
    });

    const thrown = thrownError(() => withStoreLock(fixture.store, () => "ran"));

    expect(thrown).toBeInstanceOf(StoreLockBusyError);
    expect((thrown as Error).message).toContain("kept changing");
    expect(fixture.claimEntries()).toEqual([]);
  });

  it("marks a claims directory that keeps disappearing during claim creation as busy", () => {
    const claimsDir = `${fixture.lockFile}.claims`;
    const mkdir = fs.mkdirSync;
    vi.spyOn(fs, "mkdirSync").mockImplementation((target, options) => {
      if (String(target) === claimsDir) {
        throw Object.assign(new Error("claims directory disappeared"), { code: "ENOENT" });
      }
      return mkdir(target, options);
    });

    const thrown = thrownError(() => withStoreLock(fixture.store, () => "ran"));

    expect(thrown).toBeInstanceOf(StoreLockBusyError);
    expect((thrown as Error).message).toContain("kept changing");
  });

  it("does not mark a lock taken by another writer during a reclaim as busy", () => {
    const changed = String(deadPid());
    const gapWriter = liveForeignPid();
    const rename = fs.renameSync;
    fs.writeFileSync(fixture.lockFile, String(deadPid()));
    vi.spyOn(fs, "renameSync").mockImplementation((from, to) => {
      if (String(from) !== fixture.lockFile) return rename(from, to);
      fs.writeFileSync(fixture.lockFile, changed);
      rename(from, to);
      fs.writeFileSync(fixture.lockFile, String(gapWriter));
    });

    const thrown = thrownError(() => withStoreLock(fixture.store, () => "ran"));

    expect(thrown).toBeInstanceOf(Error);
    expect(thrown).not.toBeInstanceOf(StoreLockBusyError);
    expect((thrown as Error).message).toContain(`Store lock ${fixture.lockFile} was taken by process ${gapWriter}`);
  });

  it("does not mark a nested call that meets its own outer claim as busy", () => {
    const nestedCallback = vi.fn(() => "nested");
    let thrown: unknown;

    expect(
      withStoreLock(fixture.store, () => {
        thrown = thrownError(() => withStoreLock(fixture.store, nestedCallback));
        return "outer";
      })
    ).toBe("outer");

    expect(thrown).toBeInstanceOf(Error);
    expect(thrown).not.toBeInstanceOf(StoreLockBusyError);
    expect((thrown as Error).message).toContain(`is held by process ${process.pid}, which is this process`);
    expect(nestedCallback).not.toHaveBeenCalled();
  });

  it("does not mark an error thrown by the callback as busy", () => {
    const thrown = thrownError(() =>
      withStoreLock(fixture.store, () => {
        throw new Error("callback failed");
      })
    );

    expect(thrown).not.toBeInstanceOf(StoreLockBusyError);
    expect((thrown as Error).message).toBe("callback failed");
  });
});
