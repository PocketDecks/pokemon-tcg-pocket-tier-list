import fs from "fs";
import { createHash } from "node:crypto";
import os from "os";
import path from "path";
import { vi } from "vitest";
import { planDeckWrites } from "../utils/deck-store";
import { Deck } from "../utils/types";
import { runVerify } from "../../scripts/verify-deck-store";

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

describe("verify-deck-store", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "verify-store-"));
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("fails and names the path when the store directory is absent", () => {
    const absent = path.join(dir, "absent");

    expect(runVerify({ dir: absent })).toBe(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining(absent));
  });

  it("fails when the directory holds no shards", () => {
    expect(runVerify({ dir })).toBe(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining(dir));
  });

  it("accepts an empty store when allowEmpty is set", () => {
    expect(runVerify({ dir, allowEmpty: true })).toBe(0);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("0 shards, 0 decks"));
  });

  it("passes a healthy store", () => {
    commit(planDeckWrites(dir, [makeDeck("a", "2026-09-01T10:00:00.000Z")]));

    expect(runVerify({ dir })).toBe(0);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("1 shards, 1 decks"));
  });

  const healthyStore = (): void => {
    commit(planDeckWrites(dir, [makeDeck("a", "2026-09-01T10:00:00.000Z")]));
  };

  it("fails when the processed-tournaments batch was interrupted", () => {
    healthyStore();
    const processed = path.join(dir, "processed-tournaments.json");
    fs.writeFileSync(`${processed}.tmp`, "[{}]");

    expect(runVerify({ dir, processedFile: processed })).toBe(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("interrupted processed-tournaments write"));
  });

  it("fails when the store holds shards but the processed list is missing", () => {
    healthyStore();

    expect(runVerify({ dir, processedFile: path.join(dir, "processed-tournaments.json") })).toBe(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("processed-tournaments.json is missing"));
  });

  it("fails on a duplicate processed tournament id", () => {
    healthyStore();
    const processed = path.join(dir, "processed-tournaments.json");
    fs.writeFileSync(processed, JSON.stringify([
      { id: "t1", date: "2026-09-01" },
      { id: "t1", date: "2026-09-01" },
    ]));

    expect(runVerify({ dir, processedFile: processed })).toBe(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("duplicate processed tournament"));
  });

  it.each([".tmp", ".tmp.owner", ".bak", ".created"])("fails on a leftover processed-tournaments %s file", (suffix) => {
    healthyStore();
    const processed = path.join(dir, "processed-tournaments.json");
    fs.writeFileSync(processed, JSON.stringify([{ id: "t1", date: "2026-09-01" }]));
    fs.writeFileSync(`${processed}${suffix}`, "x");

    expect(runVerify({ dir, processedFile: processed })).toBe(1);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining(`interrupted processed-tournaments write: processed-tournaments.json${suffix}`)
    );
  });

  it("fails on a stray shard staging sidecar", () => {
    healthyStore();
    fs.writeFileSync(
      path.join(dir, "shard-2026-09.ndjson.tmp.owner"),
      JSON.stringify({ version: 1, sha256: "deadbeef" })
    );

    expect(runVerify({ dir })).toBe(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("unproven writer proof"));
  });

  it("accepts a completed target with a matching owner proof", () => {
    healthyStore();
    const target = path.join(dir, "manifest.json");
    fs.writeFileSync(`${target}.tmp.owner`, JSON.stringify({
      version: 1,
      sha256: createHash("sha256").update(fs.readFileSync(target)).digest("hex"),
    }));

    expect(runVerify({ dir })).toBe(0);
  });

  it("fails on an invalid owner proof beside a completed target", () => {
    healthyStore();
    const target = path.join(dir, "manifest.json");
    fs.writeFileSync(`${target}.tmp.owner`, JSON.stringify({ version: 1, sha256: "deadbeef" }));

    expect(runVerify({ dir })).toBe(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("unproven writer proof"));
  });

  it("accepts an owner proof whose target hash matches the current target", () => {
    healthyStore();
    const target = path.join(dir, "manifest.json");
    fs.writeFileSync(`${target}.tmp.owner`, JSON.stringify({
      version: 1,
      targetSha256: createHash("sha256").update(fs.readFileSync(target)).digest("hex"),
    }));

    expect(runVerify({ dir })).toBe(0);
  });

  it("fails on an owner proof that is not JSON", () => {
    healthyStore();
    const target = path.join(dir, "manifest.json");
    fs.writeFileSync(`${target}.tmp.owner`, "not json");

    expect(runVerify({ dir })).toBe(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("unproven writer proof"));
  });

  it("fails on an owner proof with an unsupported version", () => {
    healthyStore();
    const target = path.join(dir, "manifest.json");
    fs.writeFileSync(`${target}.tmp.owner`, JSON.stringify({
      version: 2,
      sha256: createHash("sha256").update(fs.readFileSync(target)).digest("hex"),
    }));

    expect(runVerify({ dir })).toBe(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("unproven writer proof"));
  });

  it("fails on an invalid processed-tournaments entry", () => {
    healthyStore();
    const processed = path.join(dir, "processed-tournaments.json");
    fs.writeFileSync(processed, JSON.stringify([{ id: "t1" }]));

    expect(runVerify({ dir, processedFile: processed })).toBe(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("invalid entry"));
  });

  it("passes when the processed list is intact", () => {
    healthyStore();
    const processed = path.join(dir, "processed-tournaments.json");
    fs.writeFileSync(processed, JSON.stringify([{ id: "t1", date: "2026-09-01" }]));

    expect(runVerify({ dir, processedFile: processed })).toBe(0);
  });
});
