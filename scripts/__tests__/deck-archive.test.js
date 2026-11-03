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

test("every archive entry is first seen no later than it was last seen", () => {
  const archive = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "..", "public", "data", "deck-archive.json"), "utf8")
  );
  const inverted = archive.filter((entry) => entry.firstSeen > entry.lastSeen).map((entry) => entry.variant);
  assert.deepEqual(inverted, []);
});

test("a brand-new live variant is first seen on the trends snapshot date", () => {
  const { mergeCurrent } = require("../build-deck-archive.mjs");
  const trends = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "..", "public", "data", "historical-trends.json"), "utf8")
  );
  const date = trends.map((row) => row.date).sort().at(-1);
  const merged = mergeCurrent([]);
  assert.ok(merged.length > 0);
  for (const entry of merged) {
    assert.equal(entry.firstSeen, date, entry.variant);
    assert.equal(entry.lastSeen, date, entry.variant);
  }
});

test("merging clamps a first-seen date that falls after the last-seen date", () => {
  const { mergeCurrent } = require("../build-deck-archive.mjs");
  const merged = mergeCurrent([
    {
      variant: "ghost-a1-001",
      hub: "ghost",
      name: "ghost-a1-001",
      firstSeen: "2099-01-01",
      lastSeen: "2000-01-01",
    },
  ]);
  const ghost = merged.find((entry) => entry.variant === "ghost-a1-001");
  assert.equal(ghost.firstSeen, "2000-01-01");
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
