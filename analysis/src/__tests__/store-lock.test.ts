import fs from "fs";
import path from "path";
import { expectTypeOf, vi } from "vitest";
import { lockFileFor, SyncResult, withStoreLock } from "../utils/store-lock";
import { useStoreLockFixture, liveForeignPid, thrownMessage, runInWorker } from "./store-lock-fixture";

describe("withStoreLock", () => {
  const fixture = useStoreLockFixture();

  it("throws and names the holding pid when the lock is already held", () => {
    const live = liveForeignPid();
    fs.writeFileSync(fixture.lockFile, String(live));
    const heldMessage = `Store lock ${fixture.lockFile} is held by process ${live}`;

    expect(() => withStoreLock(fixture.store, () => "ran")).toThrow(heldMessage);
    expect(fixture.claimEntries()).toEqual([]);
    expect(() => withStoreLock(fixture.store, () => "ran")).toThrow(heldMessage);
    expect(fs.readFileSync(fixture.lockFile, "utf8")).toBe(String(live));
  });

  it("rejects a callback that returns a promise and leaves no lock or claim", () => {
    const asyncCallback = vi.fn(async () => "ran") as unknown as () => string;

    let thrown: unknown;
    try {
      withStoreLock(fixture.store, asyncCallback);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(TypeError);
    expect((thrown as TypeError).message).toContain("synchronous");
    expect(asyncCallback).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(fixture.lockFile)).toBe(false);
    expect(fixture.claimEntries()).toEqual([]);
  });

  it("types a promise-returning callback out and a synchronous one in", () => {
    expectTypeOf<SyncResult<Promise<number>>>().toEqualTypeOf<never>();
    expectTypeOf<Parameters<typeof withStoreLock<number>>[1]>().toEqualTypeOf<() => number>();
    expectTypeOf<() => Promise<number>>().not.toExtend<Parameters<typeof withStoreLock<Promise<number>>>[1]>();
  });

  it("keeps a late rejection from a promise-returning callback from becoming unhandled", async () => {
    const unhandled = vi.fn();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const lateCallback = (async () => {
      await Promise.resolve();
      throw new Error("late failure");
    }) as unknown as () => string;
    process.on("unhandledRejection", unhandled);
    try {
      expect(() => withStoreLock(fixture.store, lateCallback)).toThrow(TypeError);
      await new Promise((resolve) => setImmediate(resolve));
    } finally {
      process.off("unhandledRejection", unhandled);
    }

    expect(unhandled).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining("late failure"));
    expect(fs.existsSync(fixture.lockFile)).toBe(false);
  });

  it("releases the lock when the callback throws", () => {
    expect(() =>
      withStoreLock(fixture.store, () => {
        throw new Error("callback failed");
      })
    ).toThrow("callback failed");

    expect(fs.existsSync(fixture.lockFile)).toBe(false);
  });

  it("refuses a live claim that another copy of the module made in this process", async () => {
    vi.resetModules();
    const second = await import("../utils/store-lock");
    expect(second.withStoreLock).not.toBe(withStoreLock);
    const nestedCallback = vi.fn(() => "nested");
    let message = "";

    expect(
      withStoreLock(fixture.store, () => {
        message = thrownMessage(() => second.withStoreLock(fixture.store, nestedCallback));
        return "outer";
      })
    ).toBe("outer");

    expect(message).toContain(`process ${process.pid}`);
    expect(message).toContain("which is this process");
    expect(nestedCallback).not.toHaveBeenCalled();
    expect(fixture.claimEntries()).toEqual([]);
  });

  it("retries the exclusive create when the lock file is gone by the time it reads it", () => {
    const write = fs.writeFileSync;
    let first = true;
    const create = vi.spyOn(fs, "writeFileSync").mockImplementation((file, data, options) => {
      if (String(file) === fixture.lockFile && first) {
        first = false;
        throw Object.assign(new Error("lock file exists"), { code: "EEXIST" });
      }
      write(file, data, options);
    });

    expect(withStoreLock(fixture.store, () => "ran")).toBe("ran");

    expect(create).toHaveBeenCalled();
    expect(fs.existsSync(fixture.lockFile)).toBe(false);
  });

  it("leaves another process's lock file in place when the file no longer holds our pid", () => {
    const otherPid = String(process.pid + 1);

    expect(
      withStoreLock(fixture.store, () => {
        fs.writeFileSync(fixture.lockFile, otherPid);
        return "ran";
      })
    ).toBe("ran");

    expect(fs.readFileSync(fixture.lockFile, "utf8")).toBe(otherPid);
  });

  it("surfaces a lock create error that is not EEXIST", () => {
    const open = fs.openSync;
    const ran = vi.fn(() => "ran");
    vi.spyOn(fs, "openSync").mockImplementation((...args) => {
      if (String(args[0]) === fixture.lockFile) throw Object.assign(new Error("lock create denied"), { code: "EACCES" });
      return open(...args);
    });

    expect(() => withStoreLock(fixture.store, ran)).toThrow("lock create denied");

    expect(ran).not.toHaveBeenCalled();
  });

  it("tolerates the lock vanishing before release", () => {
    expect(
      withStoreLock(fixture.store, () => {
        fs.rmSync(fixture.lockFile, { force: true });
        return "ran";
      })
    ).toBe("ran");

    expect(fs.existsSync(fixture.lockFile)).toBe(false);
  });

  it("places the lock beside the store when the store path has a trailing separator", () => {
    const storeWithSeparator = `${fixture.store}${path.sep}`;
    let lockDuringCallback = false;
    let lockInsideStore = true;

    expect(
      withStoreLock(storeWithSeparator, () => {
        lockDuringCallback = fs.existsSync(fixture.lockFile);
        lockInsideStore = fs.existsSync(path.join(fixture.store, ".lock"));
        return "ran";
      })
    ).toBe("ran");

    expect(lockFileFor(storeWithSeparator)).toBe(fixture.lockFile);
    expect(path.dirname(lockFileFor(storeWithSeparator))).toBe(fixture.dir);
    expect(lockDuringCallback).toBe(true);
    expect(lockInsideStore).toBe(false);
  });

  it("creates a missing parent directory, runs the callback and leaves no lock file behind", () => {
    const nested = path.join(fixture.dir, "nested", "decks");

    expect(withStoreLock(nested, () => 42)).toBe(42);

    expect(fs.readdirSync(path.dirname(lockFileFor(nested)))).toEqual([]);
  });

  it("refuses to take the lock off the main thread before touching the filesystem, and never runs the callback", async () => {
    const outcome = await runInWorker(fixture.store);

    expect(outcome.message).toBe(
      "Store lock can only be taken on the main thread, because worker threads share the process pid but not its record of claims"
    );
    expect(outcome.ran).toBe(false);
    expect(fs.existsSync(fixture.lockFile)).toBe(false);
    expect(fs.existsSync(`${fixture.lockFile}.claims`)).toBe(false);
  });
});
