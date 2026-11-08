import fs from "fs";
import path from "path";
import { vi } from "vitest";
import { withStoreLock } from "../utils/store-lock";
import { useStoreLockFixture, deadPid, liveForeignPid, thrownMessage } from "./store-lock-fixture";

describe("withStoreLock", () => {
  const fixture = useStoreLockFixture();

  it("reclaims a lock naming this process when it holds no claim, and runs the callback", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const ran = vi.fn(() => "ran");
    fs.writeFileSync(fixture.lockFile, String(process.pid));

    expect(withStoreLock(fixture.store, ran)).toBe("ran");

    expect(warn).toHaveBeenCalledWith(
      `Store lock ${fixture.lockFile} holds pid ${process.pid}, which is this process and holds no claim; reclaiming it`
    );
    expect(ran).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(fixture.lockFile)).toBe(false);
  });

  it("reclaims a lock whose pid belongs to no running process", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const gonePid = deadPid();
    fs.writeFileSync(fixture.lockFile, String(gonePid));

    expect(withStoreLock(fixture.store, () => "ran")).toBe("ran");

    expect(warn).toHaveBeenCalledWith(expect.stringContaining(String(gonePid)));
    expect(fs.existsSync(fixture.lockFile)).toBe(false);
  });

  it("asks for a retry when the lock keeps changing during acquisition", () => {
    fs.writeFileSync(fixture.lockFile, String(process.pid));
    const ran = vi.fn(() => "ran");
    const read = fs.readFileSync;
    vi.spyOn(fs, "readFileSync").mockImplementation((target, options) => {
      if (String(target) === fixture.lockFile) {
        throw Object.assign(new Error("lock file vanished"), { code: "ENOENT" });
      }
      return read(target, options);
    });

    const message = thrownMessage(() => withStoreLock(fixture.store, ran));

    expect(message).toContain(fixture.lockFile);
    expect(message).toContain("kept changing");
    expect(message).not.toContain("has not written its pid yet");
    expect(ran).not.toHaveBeenCalled();
    expect(fixture.claimEntries()).toEqual([]);
  });

  it("moves a stale lock aside before removing it, and leaves no reclaim file", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const rename = vi.spyOn(fs, "renameSync");
    const ran = vi.fn(() => "ran");
    fs.writeFileSync(fixture.lockFile, String(deadPid()));

    expect(withStoreLock(fixture.store, ran)).toBe("ran");

    expect(rename).toHaveBeenCalledTimes(1);
    expect(rename).toHaveBeenCalledWith(fixture.lockFile, expect.stringMatching(/\.reclaim$/));
    expect(ran).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(fixture.lockFile)).toBe(false);
    expect(fixture.reclaimFiles()).toEqual([]);
  });

  it("restores a lock that changes to a live pid before it is moved aside, and refuses on that pid", () => {
    const ran = vi.fn(() => "ran");
    const live = liveForeignPid();
    const rename = fs.renameSync;
    fs.writeFileSync(fixture.lockFile, String(deadPid()));
    vi.spyOn(fs, "renameSync").mockImplementation((from, to) => {
      if (String(from) === fixture.lockFile) fs.writeFileSync(fixture.lockFile, String(live));
      return rename(from, to);
    });

    expect(thrownMessage(() => withStoreLock(fixture.store, ran))).toContain(`Store lock ${fixture.lockFile} is held by process ${live}`);

    expect(ran).not.toHaveBeenCalled();
    expect(fs.readFileSync(fixture.lockFile, "utf8")).toBe(String(live));
    expect(fixture.reclaimFiles()).toEqual([]);
  });

  it("refuses when another writer takes the lock name before the restore, names both, and leaves that lock untouched", () => {
    const ran = vi.fn(() => "ran");
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

    const message = thrownMessage(() => withStoreLock(fixture.store, ran));
    const [movedName] = fixture.reclaimFiles();

    expect(movedName).toBeDefined();
    expect(message).toContain(`Store lock ${fixture.lockFile} was taken by process ${gapWriter}`);
    expect(message).toContain(path.join(fixture.dir, movedName));
    expect(ran).not.toHaveBeenCalled();
    expect(fs.readFileSync(fixture.lockFile, "utf8")).toBe(String(gapWriter));
    expect(fs.readFileSync(path.join(fixture.dir, movedName), "utf8")).toBe(changed);
  });

  it("retries when the lock vanishes before it is moved aside", () => {
    const ran = vi.fn(() => "ran");
    const rename = fs.renameSync;
    let vanished = false;
    fs.writeFileSync(fixture.lockFile, String(deadPid()));
    vi.spyOn(fs, "renameSync").mockImplementation((from, to) => {
      if (String(from) === fixture.lockFile && !vanished) {
        vanished = true;
        fs.rmSync(fixture.lockFile, { force: true });
      }
      return rename(from, to);
    });

    expect(withStoreLock(fixture.store, ran)).toBe("ran");

    expect(vanished).toBe(true);
    expect(ran).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(fixture.lockFile)).toBe(false);
    expect(fixture.reclaimFiles()).toEqual([]);
  });

  it("keeps the lock held when it changes to a live pid before the re-read, which the second read proves the reclaimer reached", () => {
    const live = liveForeignPid();
    const read = fs.readFileSync;
    const ran = vi.fn(() => "ran");
    let reads = 0;
    fs.writeFileSync(fixture.lockFile, String(deadPid()));
    vi.spyOn(fs, "readFileSync").mockImplementation((target, options) => {
      if (String(target) === fixture.lockFile) {
        reads += 1;
        if (reads === 2) fs.writeFileSync(fixture.lockFile, String(live));
      }
      return read(target, options);
    });

    expect(() => withStoreLock(fixture.store, ran)).toThrow(`Store lock ${fixture.lockFile} is held by process ${live}`);

    expect(reads).toBe(2);
    expect(ran).not.toHaveBeenCalled();
    expect(fs.readFileSync(fixture.lockFile, "utf8")).toBe(String(live));
  });

  it("refuses a same-version writer that enters during the reclaim window, which the second read proves the reclaimer reached, and never opens the lock", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const read = fs.readFileSync;
    const open = fs.openSync;
    const stale = String(deadPid());
    const ran = vi.fn(() => "ran");
    const nestedCallback = vi.fn(() => "nested");
    let lockReads = 0;
    let inWindow = false;
    let windowOpens = 0;
    let nestedMessage = "";
    fs.writeFileSync(fixture.lockFile, stale);
    vi.spyOn(fs, "openSync").mockImplementation((...args) => {
      if (inWindow && String(args[0]) === fixture.lockFile) windowOpens += 1;
      return open(...args);
    });
    vi.spyOn(fs, "readFileSync").mockImplementation((target, options) => {
      if (String(target) === fixture.lockFile) {
        lockReads += 1;
        if (lockReads === 2) {
          inWindow = true;
          nestedMessage = thrownMessage(() => withStoreLock(fixture.store, nestedCallback));
          inWindow = false;
        }
      }
      return read(target, options);
    });

    expect(withStoreLock(fixture.store, ran)).toBe("ran");

    expect(nestedMessage).toContain(`${fixture.lockFile}.claims${path.sep}${process.pid}-`);
    expect(nestedMessage).toContain("which is this process");
    expect(windowOpens).toBe(0);
    expect(nestedCallback).not.toHaveBeenCalled();
    expect(ran).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(fixture.lockFile)).toBe(false);
  });

  it("reclaims a lock that changes to a dead pid before the re-read", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const read = fs.readFileSync;
    const ran = vi.fn(() => "ran");
    const inspected = String(deadPid());
    const changed = String(deadPid());
    let reads = 0;
    fs.writeFileSync(fixture.lockFile, inspected);
    vi.spyOn(fs, "readFileSync").mockImplementation((target, options) => {
      if (String(target) === fixture.lockFile) {
        reads += 1;
        if (reads === 2) fs.writeFileSync(fixture.lockFile, changed);
      }
      return read(target, options);
    });

    expect(withStoreLock(fixture.store, ran)).toBe("ran");

    expect(ran).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(changed));
    expect(fs.existsSync(fixture.lockFile)).toBe(false);
  });

  it("keeps the lock held when process.kill reports EPERM for the holder", () => {
    const holder = deadPid();
    const kill = process.kill;
    const ran = vi.fn(() => "ran");
    fs.writeFileSync(fixture.lockFile, String(holder));
    vi.spyOn(process, "kill").mockImplementation((pid, signal) => {
      if (pid === holder) throw Object.assign(new Error("operation not permitted"), { code: "EPERM" });
      return kill.call(process, pid, signal);
    });

    expect(() => withStoreLock(fixture.store, ran)).toThrow(`Store lock ${fixture.lockFile} is held by process ${holder}`);

    expect(ran).not.toHaveBeenCalled();
    expect(fs.readFileSync(fixture.lockFile, "utf8")).toBe(String(holder));
  });

  it("retries when a stale lock vanishes before it is removed", () => {
    const read = fs.readFileSync;
    const ran = vi.fn(() => "ran");
    const stale = String(deadPid());
    let staleReads = 0;
    let vanished = 0;
    fs.writeFileSync(fixture.lockFile, stale);
    vi.spyOn(fs, "readFileSync").mockImplementation((target, options) => {
      if (String(target) !== fixture.lockFile) return read(target, options);
      const contents = read(target, options);
      if (contents !== stale) return contents;
      staleReads += 1;
      if (staleReads !== 2) return contents;
      vanished += 1;
      fs.rmSync(fixture.lockFile, { force: true });
      return read(target, options);
    });

    expect(withStoreLock(fixture.store, ran)).toBe("ran");

    expect(vanished).toBe(1);
    expect(ran).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(fixture.lockFile)).toBe(false);
  });

  it("reclaims a dead claim while the lock is unreadable and still surfaces the read error", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const read = fs.readFileSync;
    const ran = vi.fn(() => "ran");
    const deadClaim = path.join(`${fixture.lockFile}.claims`, "dead-owner");
    fs.mkdirSync(path.dirname(deadClaim), { recursive: true });
    fs.writeFileSync(deadClaim, String(deadPid()));
    fs.writeFileSync(fixture.lockFile, String(deadPid()));
    vi.spyOn(fs, "readFileSync").mockImplementation((target, options) => {
      if (String(target) === fixture.lockFile) throw Object.assign(new Error("lock unreadable"), { code: "EACCES" });
      return read(target, options);
    });

    expect(() => withStoreLock(fixture.store, ran)).toThrow("lock unreadable");

    expect(ran).not.toHaveBeenCalled();
    expect(fs.existsSync(deadClaim)).toBe(false);
  });
});
