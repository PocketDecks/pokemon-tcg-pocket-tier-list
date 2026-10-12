import fs from "fs";
import os from "os";
import path from "path";
import {
  MANIFEST_FILE,
  planDeckWrites,
  readDecks,
  readManifest,
  verifyStore,
} from "../utils/deck-store";
import { Deck } from "../utils/types";
import { migrateLegacyDecks } from "../utils/migrate-legacy-decks";

const makeDeck = (id: string, date: string): Deck => ({
  id,
  name: "",
  cards: [],
  pokemon: 0,
  differentPokemon: 0,
  winCount: 1,
  lossCount: 1,
  totalGames: 2,
  date,
  tournamentExPercent: 0.5,
  noTrainerPercent: 0,
  wins: [],
  losses: [],
});

const commit = (files: Record<string, string>) => {
  for (const [target, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
};

describe("deck store", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "deck-store-"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("reads an absent store as empty", () => {
    expect(readManifest(dir)).toEqual({ schema: 1, shards: {} });
    expect(readDecks(dir)).toEqual([]);
  });

  it("rejects a manifest with an unknown schema", () => {
    fs.writeFileSync(path.join(dir, MANIFEST_FILE), JSON.stringify({ schema: 2, shards: {} }));
    expect(() => readManifest(dir)).toThrow("Unsupported deck store manifest");
  });

  it("routes decks to one file per expansion and records the manifest", () => {
    const old = makeDeck("old", "2025-02-01T10:00:00.000Z");
    const recent = makeDeck("recent", "2026-09-01T10:00:00.000Z");
    commit(planDeckWrites(dir, [recent, old]));

    const manifest = readManifest(dir);
    expect(Object.keys(manifest.shards).sort()).toEqual(["a2", "b4a"]);
    expect(manifest.shards.a2).toEqual({
      file: "a2.ndjson",
      count: 1,
      minDate: old.date,
      maxDate: old.date,
    });
    expect(fs.readFileSync(path.join(dir, "b4a.ndjson"), "utf8")).toBe(`${JSON.stringify(recent)}\n`);
  });

  it("reads back every deck, or only shards that reach the since date", () => {
    const old = makeDeck("old", "2025-02-01T10:00:00.000Z");
    const recent = makeDeck("recent", "2026-09-01T10:00:00.000Z");
    commit(planDeckWrites(dir, [old, recent]));

    expect(readDecks(dir).map((deck) => deck.id).sort()).toEqual(["old", "recent"]);
    expect(readDecks(dir, new Date("2026-08-27T00:00:00.000Z")).map((deck) => deck.id)).toEqual(["recent"]);
  });

  it("appends to an existing shard and widens its date range", () => {
    const first = makeDeck("one", "2026-09-02T10:00:00.000Z");
    const second = makeDeck("two", "2026-09-05T10:00:00.000Z");
    const earlier = makeDeck("three", "2026-08-30T10:00:00.000Z");
    commit(planDeckWrites(dir, [first]));
    commit(planDeckWrites(dir, [second, earlier]));

    const entry = readManifest(dir).shards.b4a;
    expect(entry.count).toBe(3);
    expect(entry.minDate).toBe(earlier.date);
    expect(entry.maxDate).toBe(second.date);
    expect(readDecks(dir).map((deck) => deck.id)).toEqual(["one", "two", "three"]);
  });

  it("plans a shard of 130,002 decks without overflowing the stack", () => {
    const bulk = Array.from({ length: 130000 }, (_, index) =>
      makeDeck(`bulk-${index}`, "2026-09-03T10:00:00.000Z")
    );
    const earliest = makeDeck("earliest", "2026-08-30T10:00:00.000Z");
    const latest = makeDeck("latest", "2026-09-05T10:00:00.000Z");

    commit(planDeckWrites(dir, [...bulk, earliest, latest]));

    const entry = readManifest(dir).shards.b4a;
    expect(entry.minDate).toBe(earliest.date);
    expect(entry.maxDate).toBe(latest.date);
  });

  it("refuses a deck id that is already in its shard", () => {
    commit(planDeckWrites(dir, [makeDeck("one", "2026-09-02T10:00:00.000Z")]));
    expect(() => planDeckWrites(dir, [makeDeck("one", "2026-09-03T10:00:00.000Z")])).toThrow(
      "already exists in shard b4a"
    );
  });

  it("refuses to write a shard file the manifest does not know about", () => {
    // An orphan shard means the manifest and the directory disagree. Appending
    // would write a file nothing points at; ignoring it would overwrite decks.
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "b4a.ndjson"), '{"id":"orphan"}\n');

    expect(() =>
      planDeckWrites(dir, [makeDeck("one", "2026-09-02T10:00:00.000Z")])
    ).toThrow("the manifest has no entry for it");
  });

  it("refuses a repeated id inside one batch", () => {
    expect(() =>
      planDeckWrites(dir, [
        makeDeck("one", "2026-09-02T10:00:00.000Z"),
        makeDeck("one", "2026-09-03T10:00:00.000Z"),
      ])
    ).toThrow("twice in one batch");
  });

  it("verifies a consistent store as clean", () => {
    commit(
      planDeckWrites(dir, [
        makeDeck("a", "2025-02-01T10:00:00.000Z"),
        makeDeck("b", "2026-09-01T10:00:00.000Z"),
      ])
    );
    expect(verifyStore(dir, { placement: true })).toEqual([]);
  });

  it("reports a manifest date range that disagrees with the shard file", () => {
    commit(
      planDeckWrites(dir, [
        makeDeck("a", "2025-02-01T10:00:00.000Z"),
        makeDeck("b", "2026-09-01T10:00:00.000Z"),
      ])
    );
    const manifest = readManifest(dir);
    manifest.shards.b4a.maxDate = "2026-12-31T00:00:00.000Z";
    fs.writeFileSync(path.join(dir, MANIFEST_FILE), JSON.stringify(manifest));

    expect(verifyStore(dir).map((problem) => problem.message)).toContain(
      "manifest dates 2026-09-01T10:00:00.000Z to 2026-12-31T00:00:00.000Z but file holds " +
        "2026-09-01T10:00:00.000Z to 2026-09-01T10:00:00.000Z"
    );
  });

  it("verifies a store written by planDeckWrites as clean", () => {
    commit(
      planDeckWrites(dir, [
        makeDeck("a", "2025-02-01T10:00:00.000Z"),
        makeDeck("b", "2026-09-01T10:00:00.000Z"),
        makeDeck("c", "2026-09-02T10:00:00.000Z"),
      ])
    );

    expect(verifyStore(dir, { placement: true })).toEqual([]);
  });

  it("verifies a store written by migrateLegacyDecks as clean", () => {
    const legacy = path.join(dir, "legacy.json");
    fs.writeFileSync(
      legacy,
      JSON.stringify([
        makeDeck("a", "2024-10-01T00:00:00.000Z"),
        makeDeck("b", "2025-02-01T00:00:00.000Z"),
        makeDeck("d", "2026-09-01T00:00:00.000Z"),
      ])
    );
    const target = path.join(dir, "migrated");

    migrateLegacyDecks(legacy, target);

    expect(verifyStore(target, { placement: true })).toEqual([]);
  });

  it("reports a staging file an interrupted write left behind", () => {
    commit(planDeckWrites(dir, [makeDeck("a", "2026-09-01T10:00:00.000Z")]));
    fs.writeFileSync(path.join(dir, "manifest.json.tmp"), "{}");
    fs.writeFileSync(path.join(dir, "b4a.ndjson.bak"), "");

    const messages = verifyStore(dir).map((problem) => problem.message);
    expect(messages).toContain("stray staging file manifest.json.tmp");
    expect(messages).toContain("stray staging file b4a.ndjson.bak");
  });

  it("reports a count mismatch, a missing file and a duplicate across shards", () => {
    commit(
      planDeckWrites(dir, [
        makeDeck("a", "2025-02-01T10:00:00.000Z"),
        makeDeck("b", "2026-09-01T10:00:00.000Z"),
      ])
    );
    fs.appendFileSync(
      path.join(dir, "b4a.ndjson"),
      `${JSON.stringify(makeDeck("a", "2026-09-02T10:00:00.000Z"))}\n`
    );
    const manifest = readManifest(dir);
    manifest.shards.a2.count = 5;
    manifest.shards.b4a.count = 2;
    manifest.shards.zzz = { file: "zzz.ndjson", count: 0, minDate: "", maxDate: "" };
    fs.writeFileSync(path.join(dir, MANIFEST_FILE), JSON.stringify(manifest));

    const messages = verifyStore(dir).map((problem) => problem.message);
    expect(messages).toContain("manifest count 5 but file holds 1");
    expect(messages).toContain("deck a also in shard a2");
    expect(messages).toContain("missing file zzz.ndjson");
  });

  it("reports a deck stored in the wrong shard only when placement is checked", () => {
    commit(planDeckWrites(dir, [makeDeck("a", "2025-02-01T10:00:00.000Z")]));
    const manifest = readManifest(dir);
    fs.renameSync(path.join(dir, "a2.ndjson"), path.join(dir, "b4a.ndjson"));
    manifest.shards = { b4a: { ...manifest.shards.a2, file: "b4a.ndjson" } };
    fs.writeFileSync(path.join(dir, MANIFEST_FILE), JSON.stringify(manifest));

    expect(verifyStore(dir)).toEqual([]);
    expect(verifyStore(dir, { placement: true }).map((problem) => problem.message)).toEqual([
      "deck a dated 2025-02-01T10:00:00.000Z belongs in shard a2",
    ]);
  });

  it("refuses a repeated id across shards inside one batch", () => {
    expect(() =>
      planDeckWrites(dir, [
        makeDeck("one", "2025-02-01T10:00:00.000Z"),
        makeDeck("one", "2026-09-02T10:00:00.000Z"),
      ])
    ).toThrow("Deck one appears twice in one batch");
  });

  it("refuses to read a deck id stored in two shards", () => {
    commit(planDeckWrites(dir, [makeDeck("one", "2025-02-01T10:00:00.000Z")]));
    commit(planDeckWrites(dir, [makeDeck("one", "2026-09-02T10:00:00.000Z")]));

    expect(() => readDecks(dir)).toThrow("Deck one appears more than once in the deck store");
  });

  it("reports a shard file the manifest does not track", () => {
    commit(planDeckWrites(dir, [makeDeck("a", "2026-09-01T10:00:00.000Z")]));
    fs.writeFileSync(
      path.join(dir, "a2.ndjson"),
      `${JSON.stringify(makeDeck("ghost", "2025-02-01T10:00:00.000Z"))}\n`
    );

    expect(verifyStore(dir)).toEqual([
      { shard: "a2", message: "untracked shard file a2.ndjson" },
    ]);
  });
});
