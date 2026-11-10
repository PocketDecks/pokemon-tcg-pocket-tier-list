import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";
import { isMainModule } from "../is-main-module.mjs";

const here = fileURLToPath(import.meta.url);

const withArgv1 = (value, assertion) => {
  const previous = process.argv[1];
  process.argv[1] = value;
  try {
    assertion();
  } finally {
    process.argv[1] = previous;
  }
};

test("returns true when invoked through the real module path", () => {
  withArgv1(here, () => assert.equal(isMainModule(import.meta.url), true));
});

test("returns false when invoked through a different file", () => {
  withArgv1(fileURLToPath(new URL("../is-main-module.mjs", import.meta.url)), () => {
    assert.equal(isMainModule(import.meta.url), false);
  });
});

test("returns false when there is no entry script", () => {
  withArgv1(undefined, () => assert.equal(isMainModule(import.meta.url), false));
});

const symlinkSupported = (() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "is-main-probe-"));
  const link = path.join(dir, "probe.mjs");
  try {
    fs.symlinkSync(here, link);
    return true;
  } catch {
    return false;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
})();

if (symlinkSupported) {
  test("returns true when invoked through a symlink or junction", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "is-main-"));
    const link = path.join(dir, "link.mjs");
    fs.symlinkSync(here, link);
    try {
      withArgv1(link, () => assert.equal(isMainModule(import.meta.url), true));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}

test("returns true when invoked through a directory junction", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "is-main-dir-"));
  const link = path.join(dir, "linked");
  fs.symlinkSync(path.dirname(here), link, "junction");
  try {
    withArgv1(path.join(link, path.basename(here)), () => assert.equal(isMainModule(import.meta.url), true));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

if (process.platform === "win32") {
  test("returns true when the entry path differs only in letter case", () => {
    withArgv1(here.toUpperCase(), () => assert.equal(isMainModule(import.meta.url), true));
  });
}
