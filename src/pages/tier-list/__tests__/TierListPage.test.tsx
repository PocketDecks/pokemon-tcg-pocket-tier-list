import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import TierListPage from "../TierListPage";

const card = (id: string, name: string) => ({
  id,
  name,
  rarity: "",
  pack: "",
  type: "",
  supertype: "",
  health: null,
  stage: null,
  image: `${id}.webp`,
  ex: false,
  set: "",
  deckBuilderNr: null,
});

const deck = (id: string, iconName: string, powerScore: number | null) => ({
  id,
  name: id,
  lists: [],
  bestList: { cards: [], score: 0, energyIds: [], deckCode: null },
  score: 0,
  popularity: 0,
  strength: 0,
  expectedWinRate: 0.5,
  fieldCoverage: powerScore === null ? 0.1 : 0.9,
  powerScore,
  freqScore: 0,
  metaScore: powerScore,
  percentOfGames: 0.01,

  iconPrimary: card(`${id}-icon`, iconName),
  iconSecondary: null,
});

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
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

describe("TierListPage", () => {
  it("leaves decks without a Power Score off the tier list", () => {
    decks.value = [deck("ranked-deck", "Ranked Icon", 80), deck("unranked-deck", "Unranked Icon", null)];

    render(
      <MemoryRouter>
        <TierListPage />
      </MemoryRouter>
    );

    expect(screen.getByAltText("Ranked Icon")).toBeInTheDocument();
    expect(screen.queryByAltText("Unranked Icon")).not.toBeInTheDocument();
    expect(screen.queryByTestId("unranked-row")).not.toBeInTheDocument();
  });
});
