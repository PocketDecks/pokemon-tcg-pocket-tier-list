import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import i18n from "../../../i18n";
import TierListPage from "../TierListPage";

const decks = vi.hoisted(() => ({ value: [] as unknown[] }));

vi.mock("../../../app/use-decks", () => ({
  useDecks: () => ({ decks: decks.value, metaShareBySlug: null, loading: false, error: null }),
}));

vi.mock("../../../app/use-filters", () => ({
  default: () => ({
    energy: null,
    setEnergy: vi.fn(),
    includeEx: true,
    setIncludeEx: vi.fn(),
    deckAmount: 30,
    setDeckAmount: vi.fn(),
    sortBy: "power",
    setSortBy: vi.fn(),
    latestExpansionCards: null,
    setLatestExpansionCards: vi.fn(),
  }),
}));

vi.mock("../../../app/use-is-premium", () => ({ default: () => false }));
vi.mock("../../../ads/ContentReadyContext", () => ({ useMarkContentReady: vi.fn() }));
vi.mock("../../../ads/AdInContent", () => ({ default: () => null }));

const feedDeck = (cards: string[]) => ({
  id: "feed-deck",
  name: "feed-deck",
  lists: [{ cards, score: 0, strength: 0, energyIds: [], deckCode: null }],
  bestList: { cards: [], score: 0, energyIds: [], deckCode: null },
  score: 0,
  popularity: 0,
  strength: 0,
  expectedWinRate: 0.5,
  fieldCoverage: 0.5,
  powerScore: null,
  freqScore: 0,
  metaScore: null,
  percentOfGames: 0,
  iconPrimary: null,
  iconSecondary: null,
});

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

beforeEach(() => {
  decks.value = [];
});

describe("TierListPage heading", () => {
  it("names the expansion the decks feed covers and its upper-cased id in the H1", () => {
    decks.value = [feedDeck(["2:c1-018"])];
    render(
      <MemoryRouter>
        <TierListPage />
      </MemoryRouter>
    );
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Dual Fusion (C1) Tier List");
  });

  it("uses the generic H1 while no expansion is covered", () => {
    render(
      <MemoryRouter>
        <TierListPage />
      </MemoryRouter>
    );
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Pokemon TCG Pocket Tier List");
  });
});
