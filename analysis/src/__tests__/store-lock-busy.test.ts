import fs from "fs";
import path from "path";
import { StoreLockBusyError, withStoreLock } from "../utils/store-lock";
import { liveForeignPid, thrownError, useStoreLockFixture } from "./store-lock-fixture";

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
