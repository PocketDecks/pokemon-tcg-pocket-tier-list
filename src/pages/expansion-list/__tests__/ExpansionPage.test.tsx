const i18nReady = vi.hoisted(async () => {
  const i18next = (await import("i18next")).default;
  const { initReactI18next } = await import("react-i18next");
  const en = (await import("../../../locales/en_translation.json")).default;
  await i18next.use(initReactI18next).init({
    lng: "en",
    resources: { en: { translation: en } },
    interpolation: { escapeValue: false },
  });
});

import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
import ExpansionPage from "../ExpansionPage";
import { cardThumbUrl } from "../../../app/deck-thumb";

const fixtures = vi.hoisted(() => {
  const card = (id: string, name: string) => ({
    id,
    name,
    rarity: "Common",
    pack: "Test",
    type: "Pokemon",
    supertype: "Pokemon",
    health: 100,
    stage: "Basic",
    image: `/cards/${id}.webp`,
    ex: false,
    set: "c1",
    deckBuilderNr: 1,
  });
  const higher = card("c1-001", "Higher");
  const lower = card("c1-002", "Lower");
  const list = (cards: unknown[]) => ({ cards, score: 1, strength: 1, energyIds: [], deckCode: null });
  const deck = {
    id: "mega-lucario-ex",
    name: "mega-lucario-ex-c1-001",
    lists: [list([higher, lower])],
    bestList: list([higher, lower]),
    score: 1,
    popularity: 1,
    strength: 1,
    expectedWinRate: 0.5,
    fieldCoverage: 0.5,
    powerScore: null,
    freqScore: 1,
    metaScore: null,
    percentOfGames: 0.5,
    iconPrimary: { ...higher, name: "Mega Lucario ex", image: "/cards/lucario.webp" },
    iconSecondary: null,
  };
  return {
    decks: [deck],
    metaShareBySlug: {
      [deck.name]: {
        name: deck.name,
        share: 0.1,
        sharePrev: 0.1,
        delta: 0,
        windowGames: 100,
        firstSeen: "2026-10-29",
        isNew: false,
      },
    },
    expansions: [{ id: "c1", name: "Dual Fusion", release_date: "2026-10-29", packs: [] }],
    cards: [higher, lower],
  };
});

vi.mock("../../../app/use-decks", () => ({
  useDecks: () => ({ decks: fixtures.decks, metaShareBySlug: fixtures.metaShareBySlug, loading: false }),
}));

vi.mock("../../../app/use-expansions", () => ({
  __esModule: true,
  default: () => fixtures.expansions,
}));

vi.mock("../../../ads/ContentReadyContext", () => ({
  __esModule: true,
  useMarkContentReady: vi.fn(),
}));

const renderPage = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  queryClient.setQueryData(["cards"], { cards: fixtures.cards });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/expansion-list/c1"]}>
        <Routes>
          <Route path="/expansion-list/:expansionId" element={<ExpansionPage />} />
          <Route path="/" element={<p>Landing marker</p>} />
          <Route path="/tier-list" element={<p>Tier list marker</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe("ExpansionPage", () => {
  it("headlines the set with its ID, release date and intro", async () => {
    await i18nReady;
    renderPage();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Dual Fusion (C1) Cards & Decks");
    expect(screen.getByText("Released 29 October 2026")).toBeInTheDocument();
    expect(
      screen.getByText("Cards from Dual Fusion that appear in current tournament decks, and the decks that play them.")
    ).toBeInTheDocument();
  });

  it("navigates the breadcrumb and back link inside the app", async () => {
    await i18nReady;
    renderPage();
    fireEvent.click(screen.getByRole("link", { name: "Home" }));
    expect(screen.getByText("Landing marker")).toBeInTheDocument();
  });

  it("navigates the back-to-tier-list link inside the app", async () => {
    await i18nReady;
    renderPage();
    fireEvent.click(screen.getByRole("link", { name: "Back to the tier list" }));
    expect(screen.getByText("Tier list marker")).toBeInTheDocument();
  });

  it("drops the summary and the current or archive label", async () => {
    await i18nReady;
    renderPage();
    expect(screen.queryByText(/Current covered expansion|Historical expansion|This Dual Fusion/)).toBeNull();
  });

  it("shows card thumbnails at a fixed size with lazy loading", () => {
    renderPage();
    const image = screen.getByRole("img", { name: "Higher" });
    expect(image).toHaveAttribute("src", cardThumbUrl("c1-001", 240));
    expect(image).toHaveAttribute("width", "240");
    expect(image).toHaveAttribute("height", "335");
    expect(image).toHaveAttribute("loading", "lazy");
  });

  it("shows the meta share once, on the deck card", () => {
    renderPage();
    expect(screen.getAllByText(/%/)).toHaveLength(1);
    expect(screen.getByText("10.0%")).toBeInTheDocument();
    expect(screen.queryByText(/movement/i)).toBeNull();
  });

  it("names each card beneath its image and omits the meta movement line", () => {
    renderPage();
    expect(screen.getByText("Lower").closest("li")).not.toBeNull();
    expect(screen.queryByText(/→/)).toBeNull();
  });

  it("lists each live deck as a row with its name beside the card", () => {
    renderPage();
    expect(screen.getByText("Mega Lucario ex").closest("li")).not.toBeNull();
  });
});
