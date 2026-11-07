import fs from "fs";
import path from "path";
import { vi } from "vitest";
import { LOCK_CONTENT_GRACE_MS, withStoreLock } from "../utils/store-lock";
import { useStoreLockFixture, deadPid, liveForeignPid, backdate, thrownMessage } from "./store-lock-fixture";

describe("withStoreLock", () => {
  const fixture = useStoreLockFixture();

  it("reclaims a lock whose content is not a positive pid once it is older than the grace period", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    fs.writeFileSync(fixture.lockFile, "0");
    backdate(fixture.lockFile);

    expect(withStoreLock(fixture.store, () => "ran")).toBe("ran");

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("holds no pid"));
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining("pid 0"));
    expect(fs.existsSync(fixture.lockFile)).toBe(false);
  });

  it("treats an empty lock file with a fresh mtime as held", () => {
    const ran = vi.fn(() => "ran");
    fs.writeFileSync(fixture.lockFile, "");

    expect(thrownMessage(() => withStoreLock(fixture.store, ran))).toBe(
      `Store lock ${fixture.lockFile} is held by a process that has not written its pid yet; ` +
        "wait for that run to finish, or remove the lock file if the process is gone"
    );

    expect(ran).not.toHaveBeenCalled();
    expect(fs.readFileSync(fixture.lockFile, "utf8")).toBe("");
  });

  it("reclaims an empty lock file older than the grace period", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    fs.writeFileSync(fixture.lockFile, "");
    backdate(fixture.lockFile);

    expect(withStoreLock(fixture.store, () => "ran")).toBe("ran");

    expect(warn).toHaveBeenCalledWith(expect.stringContaining(fixture.lockFile));
    expect(fs.existsSync(fixture.lockFile)).toBe(false);
  });

  it("does not say another run is starting when the live claim is past the grace period", () => {
    const claimsDir = `${fixture.lockFile}.claims`;
    const live = liveForeignPid();
    const ran = vi.fn(() => "ran");
    const claim = path.join(claimsDir, `${live}-00000000-0000-4000-8000-000000000000`);
    fs.mkdirSync(claimsDir, { recursive: true });
    fs.writeFileSync(claim, String(live));
    backdate(claim);

    const message = thrownMessage(() => withStoreLock(fixture.store, ran));

    expect(message).toContain(claim);
    expect(message).not.toContain("another run is starting");
    expect(ran).not.toHaveBeenCalled();
  });

  it("retries when an empty lock file vanishes before its age is read", () => {
    const stat = fs.statSync;
    const ran = vi.fn(() => "ran");
    let vanished = 0;
    fs.writeFileSync(fixture.lockFile, "");
    vi.spyOn(fs, "statSync").mockImplementation((target, options) => {
      if (String(target) === fixture.lockFile && vanished === 0) {
        vanished += 1;
        fs.rmSync(fixture.lockFile, { force: true });
        throw Object.assign(new Error("lock file vanished"), { code: "ENOENT" });
      }
      return stat(target, options);
    });

    expect(withStoreLock(fixture.store, ran)).toBe("ran");

    expect(vanished).toBe(1);
    expect(ran).toHaveBeenCalledTimes(1);
  });

  it("does not say another run is starting when a live claim is exactly at the grace period", () => {
    const base = 1_700_000_000_000;
    const live = liveForeignPid();
    const ran = vi.fn(() => "ran");
    const claim = path.join(`${fixture.lockFile}.claims`, `${live}-00000000-0000-4000-8000-000000000000`);
    fs.mkdirSync(path.dirname(claim), { recursive: true });
    fs.writeFileSync(claim, String(live));
    fs.utimesSync(claim, new Date(base), new Date(base));
    vi.spyOn(Date, "now").mockReturnValue(base + LOCK_CONTENT_GRACE_MS);

    const message = thrownMessage(() => withStoreLock(fixture.store, ran));

    expect(message).toContain(claim);
    expect(message).not.toContain("another run is starting");
    expect(ran).not.toHaveBeenCalled();
  });

  it("reclaims a claim with no pid once it is exactly at the grace period", () => {
    const base = 1_700_000_000_000;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const claim = path.join(`${fixture.lockFile}.claims`, "incomplete");
    const ran = vi.fn(() => "ran");
    fs.mkdirSync(path.dirname(claim), { recursive: true });
    fs.writeFileSync(claim, "");
    fs.utimesSync(claim, new Date(base), new Date(base));
    fs.writeFileSync(fixture.lockFile, String(deadPid()));
    vi.spyOn(Date, "now").mockReturnValue(base + LOCK_CONTENT_GRACE_MS);

    expect(withStoreLock(fixture.store, ran)).toBe("ran");

    expect(warn).toHaveBeenCalledWith(expect.stringContaining(fixture.lockFile));
    expect(ran).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(claim)).toBe(false);
  });

  it("reclaims an empty lock once it is exactly at the grace period", () => {
    const base = 1_700_000_000_000;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const ran = vi.fn(() => "ran");
    fs.writeFileSync(fixture.lockFile, "");
    fs.utimesSync(fixture.lockFile, new Date(base), new Date(base));
    vi.spyOn(Date, "now").mockReturnValue(base + LOCK_CONTENT_GRACE_MS);

    expect(withStoreLock(fixture.store, ran)).toBe("ran");

    expect(warn).toHaveBeenCalledWith(expect.stringContaining(fixture.lockFile));
    expect(ran).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(fixture.lockFile)).toBe(false);
  });

  it("keeps an empty lock held just under the grace period", () => {
    const base = 1_700_000_000_000;
    const ran = vi.fn(() => "ran");
    fs.writeFileSync(fixture.lockFile, "");
    fs.utimesSync(fixture.lockFile, new Date(base), new Date(base));
    vi.spyOn(Date, "now").mockReturnValue(base + LOCK_CONTENT_GRACE_MS - 1);

    expect(() => withStoreLock(fixture.store, ran)).toThrow(`Store lock ${fixture.lockFile} is held by`);

    expect(ran).not.toHaveBeenCalled();
    expect(fs.readFileSync(fixture.lockFile, "utf8")).toBe("");
  });

  it("reclaims an empty lock just over the grace period", () => {
    const base = 1_700_000_000_000;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const ran = vi.fn(() => "ran");
    fs.writeFileSync(fixture.lockFile, "");
    fs.utimesSync(fixture.lockFile, new Date(base), new Date(base));
    vi.spyOn(Date, "now").mockReturnValue(base + LOCK_CONTENT_GRACE_MS + 1);

    expect(withStoreLock(fixture.store, ran)).toBe("ran");

    expect(warn).toHaveBeenCalledWith(expect.stringContaining(fixture.lockFile));
    expect(ran).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(fixture.lockFile)).toBe(false);
  });

  it("keeps an empty claim held just under the grace period", () => {
    const base = 1_700_000_000_000;
    const claim = path.join(`${fixture.lockFile}.claims`, "incomplete");
    const ran = vi.fn(() => "ran");
    fs.mkdirSync(path.dirname(claim), { recursive: true });
    fs.writeFileSync(claim, "");
    fs.utimesSync(claim, new Date(base), new Date(base));
    fs.writeFileSync(fixture.lockFile, String(deadPid()));
    vi.spyOn(Date, "now").mockReturnValue(base + LOCK_CONTENT_GRACE_MS - 1);

    expect(() => withStoreLock(fixture.store, ran)).toThrow(claim);

    expect(ran).not.toHaveBeenCalled();
    expect(fs.existsSync(claim)).toBe(true);
  });

  it("reclaims an empty claim just over the grace period", () => {
    const base = 1_700_000_000_000;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const claim = path.join(`${fixture.lockFile}.claims`, "incomplete");
    const ran = vi.fn(() => "ran");
    fs.mkdirSync(path.dirname(claim), { recursive: true });
    fs.writeFileSync(claim, "");
    fs.utimesSync(claim, new Date(base), new Date(base));
    fs.writeFileSync(fixture.lockFile, String(deadPid()));
    vi.spyOn(Date, "now").mockReturnValue(base + LOCK_CONTENT_GRACE_MS + 1);

    expect(withStoreLock(fixture.store, ran)).toBe("ran");

    expect(warn).toHaveBeenCalledWith(expect.stringContaining(fixture.lockFile));
    expect(ran).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(claim)).toBe(false);
  });
});
