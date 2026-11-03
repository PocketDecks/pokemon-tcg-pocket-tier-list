const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");

test("archive check works when git is unavailable", () => {
  const script = path.join(__dirname, "..", "build-deck-archive.mjs");
  assert.doesNotThrow(() =>
    execFileSync(process.execPath, [script, "--check"], {
      cwd: path.join(__dirname, "..", ".."),
      env: { ...process.env, PATH: "" },
      stdio: "pipe",
    })
  );
});
