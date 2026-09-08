import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pairings from "../data/limitless-pairings.json";
import getDeckName from "../utils/get-deck-name";
import { canonSet, cardKey } from "../utils/set-codes";
import { Deck } from "../utils/types";

type PairingEntry = {
  secondary?: string[];
  peakCountBySet?: Record<string, number>;
  names?: Record<string, number>;
};
const store = (pairings as { pairings?: Record<string, PairingEntry> }).pairings ?? {};
const STORE_KEYS = Object.keys(store);

// Every shipped key is "Name SET N". Split off the trailing number and set so
// the normaliser can be asked to rebuild the key and prove it round-trips.
const splitKey = (key: string): { name: string; set: string; number: string } => {
  const parts = key.split(" ");
  const number = parts.pop() ?? "";
  const set = parts.pop() ?? "";
  return { name: parts.join(" "), set, number };
};

const storeSetCodes = new Set<string>();
for (const key of STORE_KEYS) {
  const { set } = splitKey(key);
  if (set) storeSetCodes.add(set);
}

// Loads the scraper-side mirror from the shipped file rather than importing
// it, because jest runs in CommonJS and cannot require the ESM mirror without
// a config change. Evaluating the real file text each run means any drift in
// set-codes.mjs fails this suite.
const loadMirror = (): {
  canonSet: (raw: string) => string;
  cardKey: (name: string, set: string, number: string) => string;
} => {
  const source = readFileSync(
    resolve(__dirname, "../../scripts/set-codes.mjs"),
    "utf8"
  );
  const body = source.replace(/^export /gm, "");
  const factory = new Function(`${body}\nreturn { canonSet, cardKey };`);
  return factory();
};

const mirror = loadMirror();

const mkDeck = (...cards: [number, string, string, string][]): Deck => ({
  id: "test-id",
  name: "Test Deck",
  cards: cards.map(([count, name, set, number]) => ({ count, name, set, number })),
  pokemon: cards.reduce((acc, [c]) => acc + c, 0),
  differentPokemon: cards.length,
  winCount: 0,
  lossCount: 0,
  totalGames: 0,
  date: "2024-03-20",
  tournamentExPercent: 0,
  noTrainerPercent: 0,
  wins: [],
  losses: [],
});

describe("canonSet", () => {
  it("folds case and promo spellings to the store form", () => {
    expect(canonSet("A1")).toBe("A1");
    expect(canonSet("a1")).toBe("A1");
    expect(canonSet("A2b")).toBe("A2b");
    expect(canonSet("a2b")).toBe("A2b");
    expect(canonSet("A2B")).toBe("A2b");
    expect(canonSet("B4a")).toBe("B4a");
    expect(canonSet("b4a")).toBe("B4a");
    expect(canonSet("PA")).toBe("PA");
    expect(canonSet("pa")).toBe("PA");
    expect(canonSet("P-A")).toBe("PA");
    expect(canonSet("P-B")).toBe("PB");
    expect(canonSet("PB")).toBe("PB");
    expect(canonSet("pb")).toBe("PB");
    // A4b is a real reprint set, kept canonical even though the scraper folds
    // its cards onto an earlier printing.
    expect(canonSet("A4b")).toBe("A4b");
    expect(canonSet("a4b")).toBe("A4b");
  });

  it("keeps every set code already stored stable", () => {
    for (const set of storeSetCodes) {
      expect(canonSet(set)).toBe(set);
    }
  });
});

describe("cardKey", () => {
  it("builds the pairing key from canonical and raw parts", () => {
    expect(cardKey("Greninja", "A1", "89")).toBe("Greninja A1 89");
    expect(cardKey("Greninja", "a1", "89")).toBe("Greninja A1 89");
    expect(cardKey("Team Rocket's Raticate ex", "b4a", "59")).toBe(
      "Team Rocket's Raticate ex B4a 59"
    );
    expect(cardKey("Lapras ex", "P-A", "14")).toBe("Lapras ex PA 14");
  });

  it("rebuilds every shipped pairing key unchanged", () => {
    expect(STORE_KEYS.length).toBeGreaterThan(0);
    for (const key of STORE_KEYS) {
      const { name, set, number } = splitKey(key);
      expect(cardKey(name, set, number)).toBe(key);
    }
  });
});

describe("the scraper-side mirror stays in step with the engine", () => {
  const rawForms: string[] = [];
  for (const set of storeSetCodes) {
    rawForms.push(set, set.toUpperCase(), set.toLowerCase());
  }
  rawForms.push("pa", "pb", "P-A", "P-B", "a1", "b4a", "A2B");

  it("agrees on canonSet for every set code form in the shipped store", () => {
    for (const raw of rawForms) {
      expect(mirror.canonSet(raw)).toBe(canonSet(raw));
    }
  });

  it("agrees on cardKey for every shipped pairing key", () => {
    for (const key of STORE_KEYS) {
      const { name, set, number } = splitKey(key);
      expect(mirror.cardKey(name, set, number)).toBe(cardKey(name, set, number));
    }
  });
});

describe("deck naming parity over the pairing store", () => {
  // Characterisation snapshot: these names were captured from the engine
  // before the set-code normaliser was extracted. They must regenerate
  // identically, or a normaliser change has corrupted a deck name.
  const cases: [string, [number, string, string, string][]][] = [
    ["lapras-ex-pa-014", [[2, "Lapras ex", "P-A", "14"]]],
    ["cresselia-ex-pa-037", [[2, "Cresselia ex", "PA", "37"]]],
    ["mega-pidgeot-ex-pb-006", [[2, "Mega Pidgeot ex", "P-B", "6"]]],
    ["mega-pidgeot-ex-pb-006", [[2, "Mega Pidgeot ex", "PB", "6"]]],
    ["team-rocket's-weezing-ex-b4a-043", [[2, "Team Rocket's Weezing ex", "B4a", "43"]]],
    ["milotic-ex-b3b-015", [[2, "Milotic ex", "B3b", "15"]]],
    ["charizard-ex-a1-036&greninja-a1-089", [[2, "Charizard ex", "A1", "36"], [2, "Greninja", "A1", "89"]]],
    ["suicune-ex-a4a-020&greninja-a1-089", [[2, "Suicune ex", "A4a", "20"], [2, "Greninja", "A1", "89"]]],
    ["giratina-ex-a2b-035&mimikyu-ex-b2-073", [[2, "Giratina ex", "A2b", "35"], [2, "Mimikyu ex", "B2", "73"]]],
    ["magnezone-a2-053", [[2, "Magnezone", "A2", "53"]]],
  ];

  it.each(cases)("names %s identically", (expected, rows) => {
    expect(getDeckName(mkDeck(...rows))).toBe(expected);
  });
});
