import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { vi } from "vitest";
import { withStoreLock } from "../utils/store-lock";
import { useStoreLockFixture, deadPid, liveForeignPid, backdate, thrownError, thrownMessage } from "./store-lock-fixture";

vi.mock("crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("crypto")>();
  return { ...actual, randomUUID: vi.fn(actual.randomUUID) };
});

describe("withStoreLock", () => {
  const fixture = useStoreLockFixture();

  it("retries when the claims directory disappears during creation", () => {
    const claimsDir = `${fixture.lockFile}.claims`;
    const mkdir = fs.mkdirSync;
    let disappeared = false;
    const ran = vi.fn(() => "ran");
    vi.spyOn(fs, "mkdirSync").mockImplementation((target, options) => {
      if (String(target) === claimsDir && !disappeared) {
        disappeared = true;
        throw Object.assign(new Error("claims directory disappeared"), { code: "ENOENT" });
      }
      return mkdir(target, options);
    });

    expect(withStoreLock(fixture.store, ran)).toBe("ran");

    expect(ran).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(fixture.lockFile)).toBe(false);
    expect(fs.existsSync(claimsDir)).toBe(false);
  });

  it("reclaims claim entries whose owner process has exited", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const deadClaim = path.join(`${fixture.lockFile}.claims`, "dead-owner");
    const gonePid = deadPid();
    fs.mkdirSync(path.dirname(deadClaim), { recursive: true });
    fs.writeFileSync(deadClaim, String(gonePid));

    expect(withStoreLock(fixture.store, () => "ran")).toBe("ran");

    expect(warn).toHaveBeenCalledWith(expect.stringContaining(String(gonePid)));
    expect(fs.existsSync(deadClaim)).toBe(false);
  });

  it("keeps a fresh claim without a pid held", () => {
    const claim = path.join(`${fixture.lockFile}.claims`, "incomplete");
    const ran = vi.fn(() => "ran");
    const stalePid = deadPid();
    fs.mkdirSync(path.dirname(claim), { recursive: true });
    fs.writeFileSync(claim, "");
    fs.writeFileSync(fixture.lockFile, String(stalePid));

    const message = thrownMessage(() => withStoreLock(fixture.store, ran));

    expect(message).toContain(claim);
    expect(message).toContain("has not written its pid yet");
    expect(message).toContain("another run is starting, so retry shortly");
    expect(message).not.toContain("remove the lock file");
    expect(ran).not.toHaveBeenCalled();
    expect(fs.existsSync(claim)).toBe(true);
    expect(fs.readFileSync(fixture.lockFile, "utf8")).toBe(String(stalePid));
  });

  it("tells the caller to retry, not to remove the claim, when a young claim has no pid while a lock file exists", () => {
    const claim = path.join(`${fixture.lockFile}.claims`, "incomplete");
    const ran = vi.fn(() => "ran");
    const stalePid = deadPid();
    fs.mkdirSync(path.dirname(claim), { recursive: true });
    fs.writeFileSync(claim, "");
    fs.writeFileSync(fixture.lockFile, String(stalePid));

    expect(thrownMessage(() => withStoreLock(fixture.store, ran))).toBe(
      `Store lock claim ${claim} has not written its pid yet; another run is starting, so retry shortly`
    );

    expect(ran).not.toHaveBeenCalled();
    expect(fs.existsSync(claim)).toBe(true);
    expect(fs.readFileSync(fixture.lockFile, "utf8")).toBe(String(stalePid));
  });

  it("keeps a young live claim without a retry suffix while a lock file exists", () => {
    const live = liveForeignPid();
    const ran = vi.fn(() => "ran");
    const claim = path.join(`${fixture.lockFile}.claims`, `${live}-00000000-0000-4000-8000-000000000000`);
    fs.mkdirSync(path.dirname(claim), { recursive: true });
    fs.writeFileSync(claim, String(live));
    fs.writeFileSync(fixture.lockFile, String(live));

    const message = thrownMessage(() => withStoreLock(fixture.store, ran));

    expect(message).toContain(claim);
    expect(message).toContain(`process ${live}`);
    expect(message).not.toContain("another run is starting");
    expect(ran).not.toHaveBeenCalled();
    expect(fs.existsSync(claim)).toBe(true);
  });

  it("keeps the live claim refusal when the lock cannot be read", () => {
    const live = liveForeignPid();
    const ran = vi.fn(() => "ran");
    const read = fs.readFileSync;
    const claim = path.join(`${fixture.lockFile}.claims`, `${live}-00000000-0000-4000-8000-000000000000`);
    fs.mkdirSync(path.dirname(claim), { recursive: true });
    fs.writeFileSync(claim, String(live));
    fs.writeFileSync(fixture.lockFile, String(live));
    vi.spyOn(fs, "readFileSync").mockImplementation((target, options) => {
      if (String(target) === fixture.lockFile) throw Object.assign(new Error("lock unreadable"), { code: "EACCES" });
      return read(target, options);
    });

    const message = thrownMessage(() => withStoreLock(fixture.store, ran));

    expect(message).toBe(
      `Store lock claim ${claim} is held by process ${live}; wait for that run to finish, ` +
        "or remove that claim file if the process is gone"
    );
    expect(ran).not.toHaveBeenCalled();
    expect(fs.existsSync(claim)).toBe(true);
  });

  it("keeps the claim refusal when the lock cannot be read while a young claim has no pid", () => {
    const claim = path.join(`${fixture.lockFile}.claims`, "incomplete");
    const ran = vi.fn(() => "ran");
    const read = fs.readFileSync;
    fs.mkdirSync(path.dirname(claim), { recursive: true });
    fs.writeFileSync(claim, "");
    fs.writeFileSync(fixture.lockFile, String(deadPid()));
    vi.spyOn(fs, "readFileSync").mockImplementation((target, options) => {
      if (String(target) === fixture.lockFile) throw Object.assign(new Error("lock unreadable"), { code: "EACCES" });
      return read(target, options);
    });

    const message = thrownMessage(() => withStoreLock(fixture.store, ran));

    expect(message).toBe(`Store lock claim ${claim} has not written its pid yet; another run is starting, so retry shortly`);
    expect(ran).not.toHaveBeenCalled();
    expect(fs.existsSync(claim)).toBe(true);
  });

  it("names this process without a retry suffix when a nested call meets the outer claim", () => {
    const claimsDir = `${fixture.lockFile}.claims`;
    const nestedCallback = vi.fn(() => "nested");
    let ownClaim = "";
    let message = "";

    expect(
      withStoreLock(fixture.store, () => {
        ownClaim = path.join(claimsDir, fixture.claimEntries()[0]);
        message = thrownMessage(() => withStoreLock(fixture.store, nestedCallback));
        return "outer";
      })
    ).toBe("outer");

    expect(message).toBe(
      `Store lock claim ${ownClaim} is held by process ${process.pid}, which is this process: ` +
        "a store lock call is still running in it; the claim clears when that call ends"
    );
    expect(nestedCallback).not.toHaveBeenCalled();
    expect(fixture.claimEntries()).toEqual([]);
  });

  it("forgets a claim this process failed to remove, so its next call reclaims it with a warning and runs", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const claimsDir = `${fixture.lockFile}.claims`;
    const remove = fs.rmSync;
    const cleanupError = Object.assign(new Error("claim removal denied"), { code: "EACCES" });
    let failures = 0;
    vi.spyOn(fs, "rmSync").mockImplementation((target, options) => {
      if (String(target).startsWith(`${claimsDir}${path.sep}`) && failures === 0) {
        failures += 1;
        throw cleanupError;
      }
      remove(target, options);
    });

    const thrown = thrownError(() => withStoreLock(fixture.store, () => "first"));

    expect(thrown).toBe(cleanupError);
    expect(fixture.claimEntries()).toHaveLength(1);
    const ran = vi.fn(() => "ran");

    expect(withStoreLock(fixture.store, ran)).toBe("ran");

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("names this process but was not created by it"));
    expect(ran).toHaveBeenCalledTimes(1);
    expect(fixture.claimEntries()).toEqual([]);
  });

  it("reclaims an aged empty claim named with this pid that this process did not create", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const claimsDir = `${fixture.lockFile}.claims`;
    const claim = path.join(claimsDir, `${process.pid}-00000000-0000-4000-8000-000000000000`);
    const ran = vi.fn(() => "ran");
    fs.mkdirSync(claimsDir, { recursive: true });
    fs.writeFileSync(claim, "");
    backdate(claim);
    fs.writeFileSync(fixture.lockFile, String(deadPid()));

    expect(withStoreLock(fixture.store, ran)).toBe("ran");

    expect(warn).toHaveBeenCalledWith(
      `Store lock claim ${claim} names this process but was not created by it; reclaiming it`
    );
    expect(ran).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(claim)).toBe(false);
    expect(fs.existsSync(fixture.lockFile)).toBe(false);
  });

  it("reclaims a claim named with this pid that this process did not create, and runs the callback", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const leftover = path.join(`${fixture.lockFile}.claims`, `${process.pid}-00000000-0000-4000-8000-000000000001`);
    const ran = vi.fn(() => "ran");
    fs.mkdirSync(path.dirname(leftover), { recursive: true });
    fs.writeFileSync(leftover, String(process.pid));

    expect(withStoreLock(fixture.store, ran)).toBe("ran");

    expect(warn).toHaveBeenCalledWith(
      `Store lock claim ${leftover} names this process but was not created by it; reclaiming it`
    );
    expect(ran).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(leftover)).toBe(false);
  });

  it("asks for a retry when the claims directory keeps disappearing", () => {
    const claimsDir = `${fixture.lockFile}.claims`;
    const ran = vi.fn(() => "ran");
    const mkdir = fs.mkdirSync;
    vi.spyOn(fs, "mkdirSync").mockImplementation((target, options) => {
      if (String(target) === claimsDir) {
        throw Object.assign(new Error("claims directory disappeared"), { code: "ENOENT" });
      }
      return mkdir(target, options);
    });

    const message = thrownMessage(() => withStoreLock(fixture.store, ran));

    expect(message).toContain(fixture.lockFile);
    expect(message).toContain("kept changing");
    expect(message).not.toContain("has not written its pid yet");
    expect(ran).not.toHaveBeenCalled();
  });

  it("ignores a stray directory in the claims directory", () => {
    const claimsDir = `${fixture.lockFile}.claims`;
    const stray = path.join(claimsDir, "stray");
    const ran = vi.fn(() => "ran");
    fs.mkdirSync(stray, { recursive: true });

    expect(withStoreLock(fixture.store, ran)).toBe("ran");

    expect(ran).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(fixture.lockFile)).toBe(false);
    expect(fs.existsSync(stray)).toBe(true);
  });

  it("fails closed when it cannot inspect claim entries", () => {
    const claimsDir = `${fixture.lockFile}.claims`;
    const ran = vi.fn(() => "ran");
    const stalePid = deadPid();
    fs.mkdirSync(claimsDir, { recursive: true });
    fs.writeFileSync(fixture.lockFile, String(stalePid));
    vi.spyOn(fs, "readdirSync").mockImplementation(() => {
      throw Object.assign(new Error("claim directory unreadable"), { code: "EACCES" });
    });

    expect(() => withStoreLock(fixture.store, ran)).toThrow("claim directory unreadable");

    expect(ran).not.toHaveBeenCalled();
    expect(fs.readFileSync(fixture.lockFile, "utf8")).toBe(String(stalePid));
  });

  it("fails closed when a claim filename and owner pid conflict", () => {
    const claimsDir = `${fixture.lockFile}.claims`;
    const stalePid = deadPid();
    const claim = path.join(claimsDir, `${stalePid}-00000000-0000-4000-8000-000000000000`);
    const staleLockPid = deadPid();
    const ran = vi.fn(() => "ran");
    fs.mkdirSync(claimsDir, { recursive: true });
    fs.writeFileSync(claim, String(process.pid));
    fs.writeFileSync(fixture.lockFile, String(staleLockPid));

    expect(() => withStoreLock(fixture.store, ran)).toThrow("conflicting owner pids");

    expect(ran).not.toHaveBeenCalled();
    expect(fs.readFileSync(fixture.lockFile, "utf8")).toBe(String(staleLockPid));
  });

  it("retries if its claim disappears during stale claim cleanup", () => {
    const claimsDir = `${fixture.lockFile}.claims`;
    const staleClaim = path.join(claimsDir, "dead-owner");
    const remove = fs.rmSync;
    let claimDisappeared = 0;
    fs.mkdirSync(claimsDir, { recursive: true });
    fs.writeFileSync(staleClaim, String(deadPid()));
    fs.writeFileSync(fixture.lockFile, String(deadPid()));
    vi.spyOn(fs, "rmSync").mockImplementation((target, options) => {
      remove(target, options);
      if (String(target) === staleClaim && claimDisappeared === 0) {
        claimDisappeared += 1;
        const ownClaim = fs
          .readdirSync(claimsDir)
          .map((name) => path.join(claimsDir, name))
          .find((file) => fs.readFileSync(file, "utf8") === String(process.pid));
        if (ownClaim) remove(ownClaim, { force: true });
      }
    });
    const ranWithClaim = vi.fn(() => {
      const ownClaims = fs
        .readdirSync(claimsDir)
        .map((name) => path.join(claimsDir, name))
        .filter((file) => fs.readFileSync(file, "utf8") === String(process.pid));
      expect(ownClaims).toHaveLength(1);
      return "ran";
    });

    expect(withStoreLock(fixture.store, ranWithClaim)).toBe("ran");

    expect(claimDisappeared).toBe(1);
    expect(ranWithClaim).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(fixture.lockFile)).toBe(false);
    expect(fixture.claimEntries()).toEqual([]);
  });

  it("refuses a contender while another live process holds a claim", () => {
    const claimsDir = `${fixture.lockFile}.claims`;
    const live = liveForeignPid();
    const ran = vi.fn(() => "ran");
    const claim = path.join(claimsDir, `${live}-00000000-0000-4000-8000-000000000000`);
    fs.mkdirSync(claimsDir, { recursive: true });
    fs.writeFileSync(claim, String(live));

    const message = thrownMessage(() => withStoreLock(fixture.store, ran));

    expect(message).toContain(claim);
    expect(message).toContain(`process ${live}`);
    expect(message).toContain("another run is starting, so retry shortly");
    expect(message).not.toContain("remove the lock file");
    expect(ran).not.toHaveBeenCalled();
    expect(fs.existsSync(claim)).toBe(true);
    expect(fs.existsSync(fixture.lockFile)).toBe(false);
  });

  it("removes its claim once when the read-back mismatch is cleaned up", () => {
    const claimsDir = `${fixture.lockFile}.claims`;
    const read = fs.readFileSync;
    const remove = fs.rmSync;
    const ran = vi.fn(() => "ran");
    const misreads: string[] = [];
    const removals = new Map<string, number>();
    vi.spyOn(fs, "readFileSync").mockImplementation((target, options) => {
      if (misreads.length === 0 && String(target).startsWith(`${claimsDir}${path.sep}`)) {
        misreads.push(String(target));
        return "0";
      }
      return read(target, options);
    });
    vi.spyOn(fs, "rmSync").mockImplementation((target, options) => {
      removals.set(String(target), (removals.get(String(target)) ?? 0) + 1);
      remove(target, options);
    });

    expect(withStoreLock(fixture.store, ran)).toBe("ran");

    expect(misreads).toHaveLength(1);
    expect(removals.get(misreads[0])).toBe(1);
    expect(ran).toHaveBeenCalledTimes(1);
    expect(fixture.claimEntries()).toEqual([]);
  });

  it("surfaces a claim open error that is neither ENOENT nor EEXIST", () => {
    const claimsDir = `${fixture.lockFile}.claims`;
    const open = fs.openSync;
    const ran = vi.fn(() => "ran");
    vi.spyOn(fs, "openSync").mockImplementation((...args) => {
      if (String(args[0]).startsWith(`${claimsDir}${path.sep}`)) {
        throw Object.assign(new Error("claim create denied"), { code: "EACCES" });
      }
      return open(...args);
    });

    expect(() => withStoreLock(fixture.store, ran)).toThrow("claim create denied");

    expect(ran).not.toHaveBeenCalled();
  });

  it("retries the claim when its open reports ENOENT", () => {
    const claimsDir = `${fixture.lockFile}.claims`;
    const open = fs.openSync;
    const ran = vi.fn(() => "ran");
    let vanished = 0;
    vi.spyOn(fs, "openSync").mockImplementation((...args) => {
      if (String(args[0]).startsWith(`${claimsDir}${path.sep}`) && vanished === 0) {
        vanished += 1;
        throw Object.assign(new Error("claims directory vanished"), { code: "ENOENT" });
      }
      return open(...args);
    });

    expect(withStoreLock(fixture.store, ran)).toBe("ran");

    expect(vanished).toBe(1);
    expect(ran).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(fixture.lockFile)).toBe(false);
  });

  it("retries the claim open instead of overwriting a file already at the claim path", () => {
    const fixed = "00000000-0000-4000-8000-0000000000aa";
    const claim = path.join(`${fixture.lockFile}.claims`, `${process.pid}-${fixed}`);
    const ran = vi.fn(() => "ran");
    fs.mkdirSync(path.dirname(claim), { recursive: true });
    fs.writeFileSync(claim, "unrelated");
    let message = "";
    vi.mocked(randomUUID).mockReturnValue(fixed);
    try {
      message = thrownMessage(() => withStoreLock(fixture.store, ran));
    } finally {
      vi.mocked(randomUUID).mockRestore();
    }

    expect(message).toContain(fixture.lockFile);
    expect(message).toContain("kept changing");
    expect(ran).not.toHaveBeenCalled();
    expect(fs.readFileSync(claim, "utf8")).toBe("unrelated");
  });

  it("skips a claim that vanishes during the scan", () => {
    const claimsDir = `${fixture.lockFile}.claims`;
    const vanishing = path.join(claimsDir, `${process.pid}-00000000-0000-4000-8000-000000000000`);
    const read = fs.readFileSync;
    const ran = vi.fn(() => "ran");
    let vanished = 0;
    fs.mkdirSync(claimsDir, { recursive: true });
    fs.writeFileSync(vanishing, String(process.pid));
    fs.writeFileSync(fixture.lockFile, String(deadPid()));
    vi.spyOn(fs, "readFileSync").mockImplementation((target, options) => {
      if (String(target) === vanishing) {
        vanished += 1;
        fs.rmSync(vanishing, { force: true });
        throw Object.assign(new Error("claim vanished"), { code: "ENOENT" });
      }
      return read(target, options);
    });

    expect(withStoreLock(fixture.store, ran)).toBe("ran");

    expect(vanished).toBe(1);
    expect(ran).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(fixture.lockFile)).toBe(false);
  });

  it("tells the caller to retry when a young claim has no pid and no lock file exists", () => {
    const claim = path.join(`${fixture.lockFile}.claims`, "incomplete");
    const ran = vi.fn(() => "ran");
    fs.mkdirSync(path.dirname(claim), { recursive: true });
    fs.writeFileSync(claim, "");

    const message = thrownMessage(() => withStoreLock(fixture.store, ran));

    expect(message).toContain(claim);
    expect(message).toContain("has not written its pid yet");
    expect(message).toContain("another run is starting, so retry shortly");
    expect(ran).not.toHaveBeenCalled();
    expect(fs.existsSync(claim)).toBe(true);
  });

  it("leaves no claim behind when the lock is refused", () => {
    const live = liveForeignPid();
    const ran = vi.fn(() => "ran");
    fs.writeFileSync(fixture.lockFile, String(live));

    expect(() => withStoreLock(fixture.store, ran)).toThrow(`Store lock ${fixture.lockFile} is held by process ${live}`);

    expect(ran).not.toHaveBeenCalled();
    expect(fixture.claimEntries()).toEqual([]);
  });

  it("leaves no claim behind when claim inspection fails", () => {
    const claimsDir = `${fixture.lockFile}.claims`;
    const ran = vi.fn(() => "ran");
    fs.mkdirSync(claimsDir, { recursive: true });
    fs.writeFileSync(fixture.lockFile, String(deadPid()));
    vi.spyOn(fs, "readdirSync").mockImplementation(() => {
      throw Object.assign(new Error("claim directory unreadable"), { code: "EACCES" });
    });

    expect(() => withStoreLock(fixture.store, ran)).toThrow("claim directory unreadable");

    expect(ran).not.toHaveBeenCalled();
    expect(fixture.claimEntries()).toEqual([]);
  });
});
