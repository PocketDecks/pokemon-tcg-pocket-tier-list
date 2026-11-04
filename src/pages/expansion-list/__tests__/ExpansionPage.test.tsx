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
import { afterEach, describe, expect, it, vi } from "vitest";
import ExpansionPage from "../ExpansionPage";
import { fetchCards } from "../../../app/cards-api";
import { useMarkContentReady } from "../../../ads/ContentReadyContext";
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
  const gengar = card("c1-010", "Gengar ex");
  const list = (cards: unknown[]) => ({ cards, score: 1, strength: 1, energyIds: [], deckCode: null });
  const deck = {
    id: "mega-lucario-ex-c1-001",
    name: "mega-lucario-ex-c1-001",
    lists: [list([higher, lower, gengar])],
    bestList: list([higher, lower, gengar]),
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
    rawDecks: [
      { name: "mega-lucario-ex-c1-001", lists: [{ score: 1, cards: ["2:c1-001", "2:c1-002", "2:c1-010"] }] },
      { name: "alpha-deck-c1-002", lists: [{ score: 1, cards: ["2:c1-002"] }] },
    ],
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
    expansions: [
      { id: "c1", name: "Dual Fusion", release_date: "2026-10-29", packs: [] },
      { id: "b4a", name: "Team Rocket's Ambition", release_date: "2026-08-27", packs: [] },
      { id: "b4b", name: "Deluxe Pack: Mega", release_date: "2026-09-30", packs: [] },
    ],
    cards: [higher, lower, gengar],
    decksError: null as Error | null,
  };
});

vi.mock("../../../app/use-decks", () => ({
  useDecks: () => ({
    decks: fixtures.decks,
    rawDecks: fixtures.rawDecks,
    metaShareBySlug: fixtures.metaShareBySlug,
    loading: false,
    error: fixtures.decksError,
  }),
}));

vi.mock("../../../app/use-expansions", () => ({
  __esModule: true,
  default: () => fixtures.expansions,
}));

vi.mock("../../../app/cards-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../app/cards-api")>();
  return { ...actual, fetchCards: vi.fn(actual.fetchCards) };
});

vi.mock("../../../ads/ContentReadyContext", () => ({
  __esModule: true,
  useMarkContentReady: vi.fn(),
}));

const renderPage = (path = "/expansion-list/c1", cards = fixtures.cards) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  queryClient.setQueryData(["cards"], { cards });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
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

  it("shows one shrug and sentence instead of both sections when no set card is in a top deck", () => {
    renderPage("/expansion-list/b4a");
    expect(screen.getByText("¯\\_(ツ)_/¯")).toBeInTheDocument();
    const message = screen.getByText(/None of the Team Rocket's Ambition cards are in a top deck right now\./);
    expect(message).toHaveTextContent("None of the Team Rocket's Ambition cards are in a top deck right now.That's unfortunate. :(");
    expect(message.querySelector("br")).not.toBeNull();
    expect(screen.queryByRole("heading", { name: "Cards used in live decks" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Live decks using this expansion" })).toBeNull();
    expect(screen.queryByText(/that appear in current tournament decks/)).toBeNull();
    expect(screen.getByRole("link", { name: "Back to the tier list" })).toBeInTheDocument();
  });

  it("lists a raw deck the client dropped as a plain link to its hub", () => {
    renderPage();
    expect(screen.getByRole("link", { name: "Alpha Deck C1 002" })).toHaveAttribute("href", "/deck/alpha-deck");
  });

  it("links a card with an archetype hub to that hub", () => {
    renderPage();
    expect(screen.getByRole("link", { name: "Gengar ex" })).toHaveAttribute("href", "/deck/gengar-ex");
  });

  it("leaves a card without an archetype hub as a plain image", () => {
    renderPage();
    expect(screen.queryByRole("link", { name: "Lower" })).toBeNull();
    expect(screen.getByRole("img", { name: "Lower" })).toBeInTheDocument();
  });

  it("renders no main landmark of its own inside the app shell", () => {
    const { container } = renderPage();
    expect(container.querySelector("main")).toBeNull();
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

describe("ExpansionPage unlisted ids", () => {
  it("renders the not-found page for a deluxe expansion id", () => {
    renderPage("/expansion-list/b4b");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Page not found");
  });
});

describe("ExpansionPage card data failure", () => {
  it("shows a load error in place of the sections and marks the page ready", async () => {
    await i18nReady;
    vi.mocked(fetchCards).mockRejectedValueOnce(new Error("offline"));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/expansion-list/c1"]}>
          <Routes>
            <Route path="/expansion-list/:expansionId" element={<ExpansionPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(await screen.findByText("Card data didn't load. Refresh the page to try again.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Cards used in live decks" })).toBeNull();
    expect(vi.mocked(useMarkContentReady)).toHaveBeenLastCalledWith(true);
  });
});

describe("ExpansionPage settled data", () => {
  afterEach(() => {
    fixtures.decksError = null;
  });

  it("renders the shrug empty state for a successful empty card dataset", () => {
    renderPage("/expansion-list/c1", []);
    expect(screen.getByText("¯\\_(ツ)_/¯")).toBeInTheDocument();
    expect(screen.getByText(/None of the Dual Fusion cards are in a top deck right now\./)).toBeInTheDocument();
  });

  it("renders the load error and marks the page ready when the deck query fails", async () => {
    await i18nReady;
    fixtures.decksError = new Error("boom");
    renderPage();
    expect(screen.getByText("Card data didn't load. Refresh the page to try again.")).toBeInTheDocument();
    expect(vi.mocked(useMarkContentReady)).toHaveBeenLastCalledWith(true);
  });
});
