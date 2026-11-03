const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

test("seeded archive preserves the latest sighting and legacy slugs", () => {
  const archive = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "..", "public", "data", "deck-archive.json"), "utf8")
  );
  const altaria = archive.find((entry) => entry.variant === "mega-altaria-ex-b1-102");
  assert.ok(altaria);
  assert.ok(altaria.lastSeen > altaria.firstSeen);
  assert.deepEqual(
    archive.find((entry) => entry.variant === "professors-research-pa-007").legacySlugs,
    ["professor's-research-pa-007"]
  );
});

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
