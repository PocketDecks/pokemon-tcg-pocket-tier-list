const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const PUBLIC_DATA = path.join(__dirname, "..", "..", "public", "data");
const FREE_DECK_LIMIT = 10;
const MOVEMENT_FIELDS = ["sharePrev", "delta", "firstSeen", "isNew"];

const readJson = (name) => JSON.parse(fs.readFileSync(path.join(PUBLIC_DATA, name), "utf8"));

const freeNamesOf = (decks) =>
  new Set(
    [...decks]
      .sort((a, b) => (b.powerScore ?? -1) - (a.powerScore ?? -1))
      .slice(0, FREE_DECK_LIMIT)
      .map((deck) => deck.name)
  );

const WINDOWS = [
  { label: "10d", suffix: "-10d", ranking: "best-decks-10d.json" },
  { label: "20d", suffix: "-20d", ranking: "best-decks-20d.json" },
  { label: "default", suffix: "", ranking: "best-decks.json" },
];

for (const { label, suffix, ranking } of WINDOWS) {
  const free = freeNamesOf(readJson(ranking));

  test(`${label} matchup data holds rows beyond Total only for the free decks`, () => {
    const matchups = readJson(`matchup-data${suffix}.json`);
    const leaking = Object.entries(matchups)
      .filter(([name]) => !free.has(name))
      .filter(([, rows]) => rows.some((row) => row.name !== "Total"))
      .map(([name]) => name);
    assert.deepStrictEqual(leaking, []);
  });

  test(`${label} matchup data keeps full rows and a Total row for every free deck`, () => {
    const matchups = readJson(`matchup-data${suffix}.json`);
    for (const name of free) {
      assert.ok(matchups[name].some((row) => row.name !== "Total"), `${name} has no matchup rows`);
    }
    for (const rows of Object.values(matchups)) {
      assert.ok(rows.some((row) => row.name === "Total"));
    }
  });

  test(`${label} meta share carries movement fields only for the free decks`, () => {
    const decks = readJson(`meta-share${suffix}.json`).decks;
    const leaking = decks
      .filter((entry) => !free.has(entry.name))
      .filter((entry) => MOVEMENT_FIELDS.some((field) => field in entry))
      .map((entry) => entry.name);
    assert.deepStrictEqual(leaking, []);
  });

  test(`${label} meta share keeps share and window games for every deck and movement for the free ones`, () => {
    const decks = readJson(`meta-share${suffix}.json`).decks;
    for (const entry of decks) {
      assert.equal(typeof entry.share, "number");
      assert.equal(typeof entry.windowGames, "number");
      if (free.has(entry.name)) {
        for (const field of MOVEMENT_FIELDS) assert.ok(field in entry, `${entry.name} lacks ${field}`);
      }
    }
  });
}

test("the default files match the 20d files", () => {
  for (const base of ["matchup-data", "meta-share"]) {
    assert.deepStrictEqual(readJson(`${base}.json`), readJson(`${base}-20d.json`));
  }
});
