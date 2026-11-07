import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import i18n from "../../../i18n";
import DeckHubPage from "../DeckHubPage";

const selected = vi.hoisted(() => ({ window: "20d" as "20d" | "30d" }));

vi.mock("../../../app/use-meta-window", () => ({
  useMetaWindow: () => ({ window: selected.window, setWindow: () => {} }),
}));

vi.mock("../../../app/use-decks", () => ({
  useDecks: () => ({
    decks: [
      {
        name: "mega-altaria-ex-b1-102",
        powerScore: 40,
        expectedWinRate: 0.5,
        iconPrimary: { name: "Mega Altaria ex" },
        iconSecondary: null,
        bestList: { cards: [] },
      },
      {
        name: "mega-altaria-ex-b1-102&greninja-a1-089",
        powerScore: 70,
        expectedWinRate: 0.4,
        iconPrimary: { name: "Mega Altaria ex" },
        iconSecondary: { name: "Greninja" },
        bestList: { cards: [] },
      },
    ],
    metaShareBySlug: {},
    loading: false,
    error: null,
  }),
  useMatchups: () => ({ matchupsByName: null, loading: false, error: null }),
}));

vi.mock("../../../app/cards-api", () => ({
  fetchCards: () => Promise.resolve({ cards: [], attacksByDeckBuilderNr: new Map() }),
}));

vi.mock("../../../ads/ContentReadyContext", () => ({ useMarkContentReady: () => {} }));

const renderHub = (window: "20d" | "30d") => {
  selected.window = window;
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: false, status: 404, statusText: "Not Found" } as Response))
  );
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={["/deck/mega-altaria-ex"]}>
        <Routes>
          <Route path="/deck/:deckId" element={<DeckHubPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
};

const variantHrefs = () =>
  screen
    .getAllByRole("link")
    .map((link) => link.getAttribute("href") ?? "")
    .filter((href) => href.startsWith("/deck/mega-altaria-ex-b1-102"));

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DeckHubPage window links", () => {
  it("links live variants without a window parameter in the default window", () => {
    renderHub("20d");

    expect(variantHrefs()).toEqual([
      "/deck/mega-altaria-ex-b1-102&greninja-a1-089",
      "/deck/mega-altaria-ex-b1-102",
    ]);
  });

  it("carries the selected window on every live variant link", () => {
    renderHub("30d");

    expect(variantHrefs()).toEqual([
      "/deck/mega-altaria-ex-b1-102&greninja-a1-089?window=30d",
      "/deck/mega-altaria-ex-b1-102?window=30d",
    ]);
  });
});
