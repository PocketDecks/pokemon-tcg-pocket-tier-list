import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { buildRunFiles } from "../utils/build-run-files";
import {
  WINDOW_IDS,
  WindowArtefacts,
  WindowId,
} from "../utils/build-window-artefacts";
import { windowArtefacts } from "./window-fixture";
import { Deck } from "../utils/types";
import { FREE_DECK_LIMIT } from "../../../src/app/free-tier";

const TODAY = new Date("2026-10-12T09:30:00Z");
const ARCHETYPES = 14;
const DAY_MS = 24 * 60 * 60 * 1000;
const NEWEST = new Date("2026-10-10T00:00:00Z").getTime();

const names = Array.from({ length: ARCHETYPES }, (_, i) => `Archetype ${String(i).padStart(2, "0")}`);

const fixtureDecks = (): Deck[] => {
  const decks: Deck[] = [];
  const ages = [0, 12, 25, 50];
  names.forEach((name, index) => {
    ages.forEach((age, slot) => {
      const total = 30 + index + slot * 3;
      const wins = Math.ceil(total * (0.62 + ((index + slot) % 5) * 0.04));
      const opponent = names[(index + slot + 1) % ARCHETYPES];
      const other = names[(index * 3 + slot + 2) % ARCHETYPES];
      decks.push({
        id: `${index}-${slot}`,
        name,
        cards: [
          { name: `Mon ${index}`, count: 2, set: "A1", number: String(index + 1) },
          { name: `Mon ${(index + slot) % 7}`, count: 1 + (slot % 2), set: "A1", number: String(((index + slot) % 7) + 1) },
        ],
        pokemon: 3,
        differentPokemon: 2,
        winCount: wins,
        lossCount: total - wins,
        totalGames: total,
        date: new Date(NEWEST - age * DAY_MS).toISOString().slice(0, 10),
        tournamentExPercent: 0,
        noTrainerPercent: 0,
        wins: [...Array(Math.ceil(wins / 2)).fill(opponent), ...Array(Math.floor(wins / 2)).fill("unmatched-deck")],
        losses: [...Array(Math.ceil((total - wins) / 2)).fill(other), ...Array(Math.floor((total - wins) / 2)).fill(opponent)],
      });
    });
  });
  decks.push({
    id: "u-0",
    name: "unmatched-deck",
    cards: [{ name: "Mon 0", count: 2, set: "A1", number: "1" }],
    pokemon: 1,
    differentPokemon: 1,
    winCount: 20,
    lossCount: 5,
    totalGames: 25,
    date: "2026-10-09",
    tournamentExPercent: 0,
    noTrainerPercent: 0,
    wins: Array(20).fill(names[0]),
    losses: Array(5).fill(names[1]),
  });
  return decks;
};

const digest = (content: string) => ({
  bytes: Buffer.byteLength(content, "utf8"),
  sha256: createHash("sha256").update(content, "utf8").digest("hex"),
});

describe("buildRunFiles characterisation", () => {
  const artefacts = Object.fromEntries(
    WINDOW_IDS.map((window) => [window, windowArtefacts(fixtureDecks(), window, TODAY)])
  ) as Record<WindowId, WindowArtefacts>;

  it("ranks more than the free limit in every window", () => {
    for (const window of WINDOW_IDS) {
      expect(artefacts[window].bestDecks.length).toBeGreaterThan(FREE_DECK_LIMIT);
    }
  });

  it("produces the recorded files byte for byte, in the recorded order", () => {
    const files = buildRunFiles({
      artefacts,
      trends: [{ date: "2026-10-01", counts: { a: 1 } }],
      cardScoresList: [{ name: "2 Mon 0", score: 1, popularity: 0.5 }],
      today: TODAY,
      premiumDir: "/premium",
    });
    const actual = Object.fromEntries(
      Object.entries(files).map(([key, content]) => [key, digest(content)])
    );
    const golden = JSON.parse(
      fs.readFileSync(path.join(__dirname, "../__fixtures__/build-run-files-golden.json"), "utf8")
    ) as Record<string, { bytes: number; sha256: string }>;

    expect(Object.keys(actual)).toEqual(Object.keys(golden));
    expect(actual).toEqual(golden);
  });
});
