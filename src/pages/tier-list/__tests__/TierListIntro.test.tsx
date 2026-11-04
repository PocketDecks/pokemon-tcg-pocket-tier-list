import { beforeEach, describe, expect, it, vi } from "vitest";
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
  iconName: name,
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

const i18nReady = vi.hoisted(async () => {
  const i18next = (await import("i18next")).default;
  const { initReactI18next } = await import("react-i18next");
  const translation = (await import("../../../locales/en_translation.json")).default;
  const seo = (await import("../../../locales/en_seo.json")).default;
  await i18next.use(initReactI18next).init({
    lng: "en",
    resources: { en: { translation, seo } },
    interpolation: { escapeValue: false },
  });
  return seo;
});

describe("tier list expansion sentence", () => {
  const coveredDeck = {
    id: "alpha",
    name: "alpha",
    lists: [{ cards: [card("c1-001", "Higher")], score: 1, energyIds: [], deckCode: null }],
    bestList: { cards: [card("c1-001", "Higher")], score: 1, energyIds: [], deckCode: null },
    score: 1,
    popularity: 0,
    strength: 0,
    expectedWinRate: 0.5,
    fieldCoverage: 0.9,
    powerScore: 80,
    freqScore: 0,
    metaScore: 80,
    percentOfGames: 0.01,
    iconPrimary: card("alpha-icon", "Alpha"),
    iconSecondary: null,
  };

  beforeEach(() => {
    decks.value = [coveredDeck];
  });

  it("keeps the intro paragraph on its main-branch text", async () => {
    const seo = await i18nReady;
    render(
      <MemoryRouter>
        <TierListPage />
      </MemoryRouter>
    );
    const paragraph = [...document.querySelectorAll("p")].find((node) =>
      node.textContent?.startsWith("This tier list ranks the best decks")
    );
    expect(paragraph?.textContent).toBe(`${seo.tierList.intro} Limitless ${seo.tierList.introAfter}`);
  });

  it("links the newest expansion in its own sentence", async () => {
    await i18nReady;
    render(
      <MemoryRouter>
        <TierListPage />
      </MemoryRouter>
    );
    expect(screen.getByRole("link", { name: "Dual Fusion cards and decks" })).toHaveAttribute(
      "href",
      "/expansion-list/c1"
    );
  });
});
