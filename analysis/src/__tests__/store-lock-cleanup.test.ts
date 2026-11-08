import fs from "fs";
import path from "path";
import { vi } from "vitest";
import { withStoreLock } from "../utils/store-lock";
import { useStoreLockFixture, deadPid, liveForeignPid, thrownError } from "./store-lock-fixture";

describe("withStoreLock", () => {
  const fixture = useStoreLockFixture();

  it("preserves a live-owner refusal when Windows rejects nonempty claim cleanup", () => {
    const claimsDir = `${fixture.lockFile}.claims`;
    const rmdir = fs.rmdirSync;
    const nestedCallback = vi.fn(() => "nested");
    vi.spyOn(fs, "rmdirSync").mockImplementation((target) => {
      if (String(target) === claimsDir && fs.readdirSync(claimsDir).length > 0) {
        throw Object.assign(new Error("directory not empty"), { code: "EPERM" });
      }
      return rmdir(target);
    });

    expect(
      withStoreLock(fixture.store, () => {
        expect(() => withStoreLock(fixture.store, nestedCallback)).toThrow(
          `Store lock claim ${claimsDir}${path.sep}${process.pid}-`
        );
        return "outer";
      })
    ).toBe("outer");

    expect(nestedCallback).not.toHaveBeenCalled();
    expect(fs.existsSync(claimsDir)).toBe(false);
  });

  it("retries claim directory removal after a peer exits during EPERM cleanup", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const claimsDir = `${fixture.lockFile}.claims`;
    const peer = path.join(claimsDir, `${process.pid + 1}-00000000-0000-4000-8000-000000000000`);
    const remove = fs.rmSync;
    const rmdir = fs.rmdirSync;
    let peerCreated = 0;
    vi.spyOn(fs, "rmSync").mockImplementation((target, options) => {
      remove(target, options);
      if (String(target).startsWith(`${claimsDir}${path.sep}`) && peerCreated === 0) {
        peerCreated += 1;
        fs.writeFileSync(peer, String(process.pid + 1));
      }
    });
    vi.spyOn(fs, "rmdirSync").mockImplementation((target) => {
      if (String(target) === claimsDir && fs.readdirSync(claimsDir).length > 0) {
        remove(peer, { force: true });
        throw Object.assign(new Error("directory not empty"), { code: "EPERM" });
      }
      return rmdir(target);
    });

    expect(withStoreLock(fixture.store, () => "ran")).toBe("ran");

    expect(peerCreated).toBe(1);
    expect(warn).not.toHaveBeenCalled();
    expect(fs.existsSync(claimsDir)).toBe(false);
  });

  it("warns and keeps the result when claim directory cleanup sees a persistent EPERM on an empty directory", () => {
    const claimsDir = `${fixture.lockFile}.claims`;
    const rmdir = fs.rmdirSync;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const ran = vi.fn(() => "ran");
    vi.spyOn(fs, "rmdirSync").mockImplementation((target) => {
      if (String(target) === claimsDir) {
        throw Object.assign(new Error("claim directory cleanup denied"), { code: "EPERM" });
      }
      return rmdir(target);
    });

    expect(withStoreLock(fixture.store, ran)).toBe("ran");

    expect(ran).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(claimsDir));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("EPERM"));
    expect(fs.existsSync(fixture.lockFile)).toBe(false);
    expect(fs.readdirSync(claimsDir)).toEqual([]);
  });

  it("surfaces a claim file removal failure without warning about the claims directory", () => {
    const claimsDir = `${fixture.lockFile}.claims`;
    const remove = fs.rmSync;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const cleanupError = Object.assign(new Error("claim removal denied"), { code: "EACCES" });
    vi.spyOn(fs, "rmSync").mockImplementation((target, options) => {
      if (String(target).startsWith(`${claimsDir}${path.sep}`)) throw cleanupError;
      remove(target, options);
    });

    const thrown = thrownError(() => withStoreLock(fixture.store, () => "ran"));

    expect(thrown).toBe(cleanupError);
    expect(warn).not.toHaveBeenCalled();
  });

  it("removes a claim whose pid write fails and leaves the lock usable", () => {
    const claimsDir = `${fixture.lockFile}.claims`;
    const open = fs.openSync;
    const writeFile = fs.writeFileSync;
    const claimDescriptors = new Set<number>();
    let failedWrites = 0;
    vi.spyOn(fs, "openSync").mockImplementation((...args) => {
      const fd = open(...args);
      if (String(args[0]).startsWith(`${claimsDir}${path.sep}`)) claimDescriptors.add(fd);
      return fd;
    });
    vi.spyOn(fs, "writeFileSync").mockImplementation((file, data, options) => {
      if (typeof file === "number" && claimDescriptors.has(file) && failedWrites === 0) {
        failedWrites += 1;
        throw Object.assign(new Error("no space left on device"), { code: "ENOSPC" });
      }
      return writeFile(file, data, options);
    });

    const thrown = thrownError(() => withStoreLock(fixture.store, () => "ran"));

    expect(thrown).toMatchObject({ code: "ENOSPC" });
    expect(failedWrites).toBe(1);
    expect(fixture.claimEntries()).toEqual([]);
    expect(withStoreLock(fixture.store, () => "ran")).toBe("ran");
  });

  it("removes the lock file when its pid write fails and lets the next run take it", () => {
    const open = fs.openSync;
    const writeFile = fs.writeFileSync;
    let lockDescriptor: number | undefined;
    let failedWrites = 0;
    const ran = vi.fn(() => "ran");
    vi.spyOn(fs, "openSync").mockImplementation((...args) => {
      const fd = open(...args);
      if (String(args[0]) === fixture.lockFile) lockDescriptor = fd;
      return fd;
    });
    vi.spyOn(fs, "writeFileSync").mockImplementation((file, data, options) => {
      if (file === lockDescriptor && failedWrites === 0) {
        failedWrites += 1;
        throw Object.assign(new Error("no space left on device"), { code: "ENOSPC" });
      }
      return writeFile(file, data, options);
    });

    expect(() => withStoreLock(fixture.store, ran)).toThrow("no space left on device");

    expect(failedWrites).toBe(1);
    expect(fs.existsSync(fixture.lockFile)).toBe(false);
    expect(withStoreLock(fixture.store, ran)).toBe("ran");
    expect(ran).toHaveBeenCalledTimes(1);
  });

  it("keeps the write error when removing the claim also fails", () => {
    const claimsDir = `${fixture.lockFile}.claims`;
    const open = fs.openSync;
    const writeFile = fs.writeFileSync;
    const remove = fs.rmSync;
    const claimDescriptors = new Set<number>();
    const writeError = Object.assign(new Error("no space left on device"), { code: "ENOSPC" });
    const cleanupError = Object.assign(new Error("claim removal denied"), { code: "EACCES" });
    vi.spyOn(fs, "openSync").mockImplementation((...args) => {
      const fd = open(...args);
      if (String(args[0]).startsWith(`${claimsDir}${path.sep}`)) claimDescriptors.add(fd);
      return fd;
    });
    vi.spyOn(fs, "writeFileSync").mockImplementation((file, data, options) => {
      if (typeof file === "number" && claimDescriptors.has(file)) throw writeError;
      return writeFile(file, data, options);
    });
    vi.spyOn(fs, "rmSync").mockImplementation((target, options) => {
      if (String(target).startsWith(`${claimsDir}${path.sep}`)) throw cleanupError;
      remove(target, options);
    });

    const thrown = thrownError(() => withStoreLock(fixture.store, () => "ran"));

    expect(thrown).toBeInstanceOf(AggregateError);
    const aggregate = thrown as AggregateError;
    expect(aggregate.message).toContain("no space left on device");
    expect(aggregate.message).toContain("store lock cleanup also failed");
    expect(aggregate.errors).toEqual([writeError, cleanupError]);
  });

  it("flattens a lock write failure with lock and claim cleanup failures into one aggregate", () => {
    const claimsDir = `${fixture.lockFile}.claims`;
    const open = fs.openSync;
    const writeFile = fs.writeFileSync;
    const remove = fs.rmSync;
    let lockDescriptor: number | undefined;
    const writeError = Object.assign(new Error("no space left on device"), { code: "ENOSPC" });
    const lockCleanupError = Object.assign(new Error("lock removal denied"), { code: "EACCES" });
    const claimCleanupError = Object.assign(new Error("claim removal denied"), { code: "EACCES" });
    vi.spyOn(fs, "openSync").mockImplementation((...args) => {
      const fd = open(...args);
      if (String(args[0]) === fixture.lockFile) lockDescriptor = fd;
      return fd;
    });
    vi.spyOn(fs, "writeFileSync").mockImplementation((file, data, options) => {
      if (file === lockDescriptor) throw writeError;
      return writeFile(file, data, options);
    });
    vi.spyOn(fs, "rmSync").mockImplementation((target, options) => {
      if (String(target) === fixture.lockFile) throw lockCleanupError;
      if (String(target).startsWith(`${claimsDir}${path.sep}`)) throw claimCleanupError;
      remove(target, options);
    });

    const thrown = thrownError(() => withStoreLock(fixture.store, () => "ran"));

    expect(thrown).toBeInstanceOf(AggregateError);
    const aggregate = thrown as AggregateError;
    expect(aggregate.message).toBe(
      "no space left on device; store lock cleanup also failed: lock removal denied; claim removal denied"
    );
    expect(aggregate.errors).toHaveLength(3);
    expect(aggregate.errors[0]).toBe(writeError);
    expect(aggregate.errors[1]).toBe(lockCleanupError);
    expect(aggregate.errors[2]).toBe(claimCleanupError);
  });

  it("names every cleanup failure once when a write and close aggregate meets a lock cleanup failure", () => {
    const open = fs.openSync;
    const writeFile = fs.writeFileSync;
    const close = fs.closeSync;
    const remove = fs.rmSync;
    let lockDescriptor: number | undefined;
    const writeError = Object.assign(new Error("no space left on device"), { code: "ENOSPC" });
    const closeError = Object.assign(new Error("close failed"), { code: "EIO" });
    const cleanupError = Object.assign(new Error("lock removal denied"), { code: "EACCES" });
    vi.spyOn(fs, "openSync").mockImplementation((...args) => {
      const fd = open(...args);
      if (String(args[0]) === fixture.lockFile) lockDescriptor = fd;
      return fd;
    });
    vi.spyOn(fs, "writeFileSync").mockImplementation((file, data, options) => {
      if (file === lockDescriptor) throw writeError;
      return writeFile(file, data, options);
    });
    vi.spyOn(fs, "closeSync").mockImplementation((fd) => {
      close(fd);
      if (fd === lockDescriptor) throw closeError;
    });
    vi.spyOn(fs, "rmSync").mockImplementation((target, options) => {
      if (String(target) === fixture.lockFile) throw cleanupError;
      remove(target, options);
    });

    const thrown = thrownError(() => withStoreLock(fixture.store, () => "ran"));

    expect(thrown).toBeInstanceOf(AggregateError);
    const aggregate = thrown as AggregateError;
    expect(aggregate.message).toBe(
      "no space left on device; closing the store lock file also failed; store lock cleanup also failed: lock removal denied"
    );
    expect(aggregate.errors).toHaveLength(3);
    expect(aggregate.errors).toEqual([writeError, closeError, cleanupError]);
  });

  it("keeps both the pid write error and the close error when the lock write and close both fail", () => {
    const open = fs.openSync;
    const writeFile = fs.writeFileSync;
    const close = fs.closeSync;
    let lockDescriptor: number | undefined;
    const writeError = Object.assign(new Error("no space left on device"), { code: "ENOSPC" });
    const closeError = Object.assign(new Error("close failed"), { code: "EIO" });
    vi.spyOn(fs, "openSync").mockImplementation((...args) => {
      const fd = open(...args);
      if (String(args[0]) === fixture.lockFile) lockDescriptor = fd;
      return fd;
    });
    vi.spyOn(fs, "writeFileSync").mockImplementation((file, data, options) => {
      if (file === lockDescriptor) throw writeError;
      return writeFile(file, data, options);
    });
    vi.spyOn(fs, "closeSync").mockImplementation((fd) => {
      close(fd);
      if (fd === lockDescriptor) throw closeError;
    });

    const thrown = thrownError(() => withStoreLock(fixture.store, () => "ran"));

    expect(thrown).toBeInstanceOf(AggregateError);
    const aggregate = thrown as AggregateError;
    expect(aggregate.message).toBe("no space left on device; closing the store lock file also failed");
    expect(aggregate.errors).toHaveLength(2);
    expect(aggregate.errors[0]).toBe(writeError);
    expect(aggregate.errors[1]).toBe(closeError);
    expect(fs.existsSync(fixture.lockFile)).toBe(false);
  });

  it("keeps the claim refusal when removing the claim also fails", () => {
    const claimsDir = `${fixture.lockFile}.claims`;
    const staleClaim = path.join(claimsDir, `${deadPid()}-00000000-0000-4000-8000-000000000000`);
    const remove = fs.rmSync;
    const cleanupError = Object.assign(new Error("claim removal denied"), { code: "EACCES" });
    fs.mkdirSync(claimsDir, { recursive: true });
    fs.writeFileSync(staleClaim, String(process.pid));
    fs.writeFileSync(fixture.lockFile, String(deadPid()));
    vi.spyOn(fs, "rmSync").mockImplementation((target, options) => {
      if (String(target).startsWith(`${claimsDir}${path.sep}`) && String(target) !== staleClaim) throw cleanupError;
      remove(target, options);
    });
    const ran = vi.fn(() => "ran");

    const thrown = thrownError(() => withStoreLock(fixture.store, ran));

    expect(thrown).toBeInstanceOf(AggregateError);
    const aggregate = thrown as AggregateError;
    expect(aggregate.message).toContain("conflicting owner pids");
    expect(aggregate.errors).toHaveLength(2);
    expect(aggregate.errors[1]).toBe(cleanupError);
    expect(ran).not.toHaveBeenCalled();
  });

  it("keeps the held refusal when removing the claim also fails", () => {
    const live = liveForeignPid();
    const claimsDir = `${fixture.lockFile}.claims`;
    const remove = fs.rmSync;
    const cleanupError = Object.assign(new Error("claim removal denied"), { code: "EACCES" });
    const ran = vi.fn(() => "ran");
    fs.writeFileSync(fixture.lockFile, String(live));
    vi.spyOn(fs, "rmSync").mockImplementation((target, options) => {
      if (String(target).startsWith(`${claimsDir}${path.sep}`)) throw cleanupError;
      remove(target, options);
    });

    const thrown = thrownError(() => withStoreLock(fixture.store, ran));

    expect(thrown).toBeInstanceOf(AggregateError);
    const aggregate = thrown as AggregateError;
    expect(aggregate.message).toContain(`Store lock ${fixture.lockFile} is held by process ${live}`);
    expect(aggregate.errors).toHaveLength(2);
    expect(aggregate.errors[1]).toBe(cleanupError);
    expect(ran).not.toHaveBeenCalled();
  });

  it("surfaces a failed removal of a claim that reads back another pid, with the mismatch as the original", () => {
    const claimsDir = `${fixture.lockFile}.claims`;
    const read = fs.readFileSync;
    const remove = fs.rmSync;
    const cleanupError = Object.assign(new Error("claim removal denied"), { code: "EACCES" });
    const misreads: string[] = [];
    vi.spyOn(fs, "readFileSync").mockImplementation((target, options) => {
      if (misreads.length === 0 && String(target).startsWith(`${claimsDir}${path.sep}`)) {
        misreads.push(String(target));
        return "0";
      }
      return read(target, options);
    });
    vi.spyOn(fs, "rmSync").mockImplementation((target, options) => {
      if (String(target).startsWith(`${claimsDir}${path.sep}`)) throw cleanupError;
      remove(target, options);
    });
    const ran = vi.fn(() => "ran");

    const thrown = thrownError(() => withStoreLock(fixture.store, ran));

    expect(misreads).toHaveLength(1);
    expect(thrown).toBeInstanceOf(AggregateError);
    const aggregate = thrown as AggregateError;
    expect(aggregate.errors).toHaveLength(2);
    expect(aggregate.errors[0]).toBeInstanceOf(Error);
    expect(aggregate.errors[1]).toBe(cleanupError);
    expect(aggregate.message).toBe(
      `Store lock claim ${misreads[0]} did not read back this process's pid; store lock cleanup also failed: claim removal denied`
    );
    expect(ran).not.toHaveBeenCalled();
  });

  it("flattens a callback AggregateError with the claim cleanup failure into one aggregate", () => {
    const claimsDir = `${fixture.lockFile}.claims`;
    const remove = fs.rmSync;
    const first = new Error("purge refused");
    const second = new Error("store unreadable");
    const callbackError = new AggregateError([first, second], "purge failed");
    const cleanupError = Object.assign(new Error("claim removal denied"), { code: "EACCES" });
    vi.spyOn(fs, "rmSync").mockImplementation((target, options) => {
      if (String(target).startsWith(`${claimsDir}${path.sep}`)) throw cleanupError;
      remove(target, options);
    });

    const thrown = thrownError(() => {
      withStoreLock(fixture.store, () => {
        throw callbackError;
      });
    });

    expect(thrown).toBeInstanceOf(AggregateError);
    const aggregate = thrown as AggregateError;
    expect(aggregate.errors).toHaveLength(3);
    expect(aggregate.errors[0]).toBe(first);
    expect(aggregate.errors[1]).toBe(second);
    expect(aggregate.errors[2]).toBe(cleanupError);
    expect(aggregate.message).toBe("purge failed; store lock cleanup also failed: claim removal denied");
  });

  it("names both cleanup failures in the message when a callback error meets release and claim failures", () => {
    const claimsDir = `${fixture.lockFile}.claims`;
    const remove = fs.rmSync;
    const callbackError = new Error("purge refused");
    const releaseError = Object.assign(new Error("lock removal denied"), { code: "EACCES" });
    const claimError = Object.assign(new Error("claim removal denied"), { code: "EACCES" });
    vi.spyOn(fs, "rmSync").mockImplementation((target, options) => {
      if (String(target) === fixture.lockFile) throw releaseError;
      if (String(target).startsWith(`${claimsDir}${path.sep}`)) throw claimError;
      remove(target, options);
    });

    const thrown = thrownError(() => {
      withStoreLock(fixture.store, () => {
        throw callbackError;
      });
    });

    expect(thrown).toBeInstanceOf(AggregateError);
    const aggregate = thrown as AggregateError;
    expect(aggregate.errors).toHaveLength(3);
    expect(aggregate.errors[0]).toBe(callbackError);
    expect(aggregate.errors[1]).toBe(releaseError);
    expect(aggregate.errors[2]).toBe(claimError);
    expect(aggregate.message).toBe(
      "purge refused; store lock cleanup also failed: lock removal denied; claim removal denied"
    );
  });

  it("keeps the callback error when claim cleanup also fails", () => {
    const claimsDir = `${fixture.lockFile}.claims`;
    const remove = fs.rmSync;
    const callbackError = new Error("purge refused");
    const cleanupError = Object.assign(new Error("claim removal denied"), { code: "EACCES" });
    vi.spyOn(fs, "rmSync").mockImplementation((target, options) => {
      if (String(target).startsWith(`${claimsDir}${path.sep}`)) throw cleanupError;
      remove(target, options);
    });

    const thrown = thrownError(() => {
      withStoreLock(fixture.store, () => {
        throw callbackError;
      });
    });

    expect(thrown).toBeInstanceOf(AggregateError);
    const aggregate = thrown as AggregateError;
    expect(aggregate.message).toMatch(/^purge refused/);
    expect(aggregate.message).toContain("lock cleanup also failed");
    expect(aggregate.errors).toHaveLength(2);
    expect(aggregate.errors[0]).toBe(callbackError);
    expect(aggregate.errors[1]).toBe(cleanupError);
  });

  it("labels a callback error that already names the cleanup label once, and keeps its text intact", () => {
    const claimsDir = `${fixture.lockFile}.claims`;
    const remove = fs.rmSync;
    const callbackError = new Error("purge; store lock cleanup also failed: old");
    const cleanupError = Object.assign(new Error("claim removal denied"), { code: "EACCES" });
    vi.spyOn(fs, "rmSync").mockImplementation((target, options) => {
      if (String(target).startsWith(`${claimsDir}${path.sep}`)) throw cleanupError;
      remove(target, options);
    });

    const thrown = thrownError(() => {
      withStoreLock(fixture.store, () => {
        throw callbackError;
      });
    });

    expect(thrown).toBeInstanceOf(AggregateError);
    const aggregate = thrown as AggregateError;
    expect(aggregate.message).toBe(
      "purge; store lock cleanup also failed: old; store lock cleanup also failed: claim removal denied"
    );
    expect(aggregate.errors).toEqual([callbackError, cleanupError]);
  });

  it("surfaces a cleanup error when the callback succeeds", () => {
    const claimsDir = `${fixture.lockFile}.claims`;
    const remove = fs.rmSync;
    const cleanupError = Object.assign(new Error("claim removal denied"), { code: "EACCES" });
    vi.spyOn(fs, "rmSync").mockImplementation((target, options) => {
      if (String(target).startsWith(`${claimsDir}${path.sep}`)) throw cleanupError;
      remove(target, options);
    });

    const thrown = thrownError(() => withStoreLock(fixture.store, () => "ran"));

    expect(thrown).toBe(cleanupError);
  });

  it("rethrows the callback error unchanged when cleanup succeeds", () => {
    const callbackError = new Error("purge refused");

    const thrown = thrownError(() => {
      withStoreLock(fixture.store, () => {
        throw callbackError;
      });
    });

    expect(thrown).toBe(callbackError);
  });

  it("aggregates release and claim cleanup errors when the callback succeeds", () => {
    const claimsDir = `${fixture.lockFile}.claims`;
    const remove = fs.rmSync;
    const releaseError = Object.assign(new Error("lock removal denied"), { code: "EACCES" });
    const claimError = Object.assign(new Error("claim removal denied"), { code: "EACCES" });
    vi.spyOn(fs, "rmSync").mockImplementation((target, options) => {
      if (String(target) === fixture.lockFile) throw releaseError;
      if (String(target).startsWith(`${claimsDir}${path.sep}`)) throw claimError;
      remove(target, options);
    });

    const thrown = thrownError(() => {
      withStoreLock(fixture.store, () => {
        fs.writeFileSync(fixture.lockFile, String(process.pid));
        return "ran";
      });
    });

    expect(thrown).toBeInstanceOf(AggregateError);
    expect((thrown as AggregateError).errors).toHaveLength(2);
    expect((thrown as AggregateError).errors[0]).toBe(releaseError);
    expect((thrown as AggregateError).errors[1]).toBe(claimError);
    expect((thrown as AggregateError).message).toBe(
      `store lock cleanup failed: ${releaseError.message}; ${claimError.message}`
    );
  });

  it.each(["ENOENT", "ENOTEMPTY", "EEXIST"])("tolerates %s when the claims directory cannot be removed", (code) => {
    const claimsDir = `${fixture.lockFile}.claims`;
    const rmdir = fs.rmdirSync;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const ran = vi.fn(() => "ran");
    vi.spyOn(fs, "rmdirSync").mockImplementation((target) => {
      if (String(target) === claimsDir) throw Object.assign(new Error("claims directory refused"), { code });
      return rmdir(target);
    });

    expect(withStoreLock(fixture.store, ran)).toBe("ran");

    expect(ran).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
    expect(fs.existsSync(fixture.lockFile)).toBe(false);
  });

  it.each(["ENOENT", "ENOTEMPTY", "EEXIST"])("tolerates %s when the claims directory retry is refused", (code) => {
    const claimsDir = `${fixture.lockFile}.claims`;
    const rmdir = fs.rmdirSync;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const ran = vi.fn(() => "ran");
    let attempts = 0;
    vi.spyOn(fs, "rmdirSync").mockImplementation((target) => {
      if (String(target) !== claimsDir) return rmdir(target);
      attempts += 1;
      throw Object.assign(new Error("claims directory refused"), { code: attempts === 1 ? "EPERM" : code });
    });

    expect(withStoreLock(fixture.store, ran)).toBe("ran");

    expect(warn).not.toHaveBeenCalled();
    expect(ran).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(fixture.lockFile)).toBe(false);
  });

  it("tolerates a claims directory that vanishes before its entries are listed", () => {
    const claimsDir = `${fixture.lockFile}.claims`;
    const rmdir = fs.rmdirSync;
    const readdir = fs.readdirSync;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const ran = vi.fn(() => "ran");
    let removalAttempted = false;
    vi.spyOn(fs, "rmdirSync").mockImplementation((target, options) => {
      if (String(target) === claimsDir) {
        removalAttempted = true;
        throw Object.assign(new Error("claim directory cleanup denied"), { code: "EPERM" });
      }
      return rmdir(target, options);
    });
    vi.spyOn(fs, "readdirSync").mockImplementation((target, options) => {
      if (removalAttempted && String(target) === claimsDir) {
        throw Object.assign(new Error("claims directory vanished"), { code: "ENOENT" });
      }
      return readdir(target, options);
    });

    expect(withStoreLock(fixture.store, ran)).toBe("ran");

    expect(fs.existsSync(claimsDir)).toBe(true);
    expect(ran).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
    expect(fs.existsSync(fixture.lockFile)).toBe(false);
  });

  it("tolerates a claims directory that vanishes before the retry lists its entries", () => {
    const claimsDir = `${fixture.lockFile}.claims`;
    const rmdir = fs.rmdirSync;
    const readdir = fs.readdirSync;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const ran = vi.fn(() => "ran");
    let removalAttempts = 0;
    vi.spyOn(fs, "rmdirSync").mockImplementation((target, options) => {
      if (String(target) === claimsDir) {
        removalAttempts += 1;
        throw Object.assign(new Error("claim directory cleanup denied"), { code: "EPERM" });
      }
      return rmdir(target, options);
    });
    vi.spyOn(fs, "readdirSync").mockImplementation((target, options) => {
      if (removalAttempts > 1 && String(target) === claimsDir) {
        throw Object.assign(new Error("claims directory vanished"), { code: "ENOENT" });
      }
      return readdir(target, options);
    });

    expect(withStoreLock(fixture.store, ran)).toBe("ran");

    expect(fs.existsSync(claimsDir)).toBe(true);
    expect(ran).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
    expect(fs.existsSync(fixture.lockFile)).toBe(false);
  });

  it("surfaces a close error after a successful pid write and removes the lock file", () => {
    const open = fs.openSync;
    const close = fs.closeSync;
    let lockDescriptor: number | undefined;
    const closeError = Object.assign(new Error("close failed"), { code: "EIO" });
    vi.spyOn(fs, "openSync").mockImplementation((...args) => {
      const fd = open(...args);
      if (String(args[0]) === fixture.lockFile) lockDescriptor = fd;
      return fd;
    });
    vi.spyOn(fs, "closeSync").mockImplementation((fd) => {
      close(fd);
      if (fd === lockDescriptor) throw closeError;
    });

    const thrown = thrownError(() => withStoreLock(fixture.store, () => "ran"));

    expect(thrown).toBe(closeError);
    expect(fs.existsSync(fixture.lockFile)).toBe(false);
    expect(fixture.claimEntries()).toEqual([]);
  });

  it("closes the claim descriptor after a failed pid write", () => {
    const claimsDir = `${fixture.lockFile}.claims`;
    const open = fs.openSync;
    const close = fs.closeSync;
    const writeFile = fs.writeFileSync;
    const claimDescriptors = new Set<number>();
    const closed: number[] = [];
    vi.spyOn(fs, "openSync").mockImplementation((...args) => {
      const fd = open(...args);
      if (String(args[0]).startsWith(`${claimsDir}${path.sep}`)) claimDescriptors.add(fd);
      return fd;
    });
    vi.spyOn(fs, "writeFileSync").mockImplementation((file, data, options) => {
      if (typeof file === "number" && claimDescriptors.has(file)) {
        throw Object.assign(new Error("no space left on device"), { code: "ENOSPC" });
      }
      return writeFile(file, data, options);
    });
    vi.spyOn(fs, "closeSync").mockImplementation((fd) => {
      closed.push(fd);
      close(fd);
    });

    expect(() => withStoreLock(fixture.store, () => "ran")).toThrow("no space left on device");

    expect(claimDescriptors.size).toBe(1);
    for (const fd of claimDescriptors) expect(closed).toContain(fd);
  });
});
