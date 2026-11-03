import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import DeckHubPage from "../DeckHubPage";

const decksState = vi.hoisted(() => ({
  value: { decks: [] as unknown[] | null, metaShareBySlug: {}, loading: false, error: null as Error | null },
}));

vi.mock("../../../app/use-decks", () => ({
  useDecks: () => decksState.value,
}));

vi.mock("../../../ads/ContentReadyContext", () => ({
  useMarkContentReady: () => undefined,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("../../not-found/NotFoundPage", () => ({
  __esModule: true,
  default: () => <p>not found page</p>,
}));

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/deck/:deckId" element={<DeckHubPage />} />
      </Routes>
    </MemoryRouter>
  );

describe("DeckHubPage", () => {
  it("renders a known hub from the deck route parameter", () => {
    renderAt("/deck/mega-greninja-ex");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Mega Greninja ex Deck");
    expect(screen.queryByText("not found page")).toBeNull();
  });

  it("does not claim the hub is out of meta when decks fail to load", () => {
    decksState.value = { decks: null, metaShareBySlug: {}, loading: false, error: new Error("offline") };
    renderAt("/deck/mega-greninja-ex");
    expect(screen.queryByText(/Not in the current/)).toBeNull();
    decksState.value = { decks: [], metaShareBySlug: {}, loading: false, error: null };
  });

  it("lists live variants by power score, highest first, with unscored decks last", () => {
    decksState.value = {
      decks: [
        { name: "mega-altaria-ex-b1-102", powerScore: 40, expectedWinRate: 0.5 },
        { name: "mega-altaria-ex-b1-102&espeon-b3a-020", powerScore: null, expectedWinRate: 0.6 },
        { name: "mega-altaria-ex-b1-102&greninja-a1-089", powerScore: 70, expectedWinRate: 0.4 },
      ] as unknown[],
      metaShareBySlug: {},
      loading: false,
      error: null,
    };
    renderAt("/deck/mega-altaria-ex");
    const hrefs = screen
      .getAllByRole("link")
      .map((link) => link.getAttribute("href") ?? "")
      .filter((href) => href.startsWith("/deck/mega-altaria-ex-b1-102"));
    expect(hrefs).toEqual([
      "/deck/mega-altaria-ex-b1-102&greninja-a1-089",
      "/deck/mega-altaria-ex-b1-102",
      "/deck/mega-altaria-ex-b1-102&espeon-b3a-020",
    ]);
    decksState.value = { decks: [], metaShareBySlug: {}, loading: false, error: null };
  });

  it("keeps the locale on variant links", () => {
    decksState.value = {
      decks: [{ name: "mega-altaria-ex-b1-102", powerScore: 40, expectedWinRate: 0.5 }] as unknown[],
      metaShareBySlug: {},
      loading: false,
      error: null,
    };
    render(
      <MemoryRouter initialEntries={["/ja/deck/mega-altaria-ex"]}>
        <Routes>
          <Route path="/ja/deck/:deckId" element={<DeckHubPage />} />
        </Routes>
      </MemoryRouter>
    );
    const hrefs = screen
      .getAllByRole("link")
      .map((link) => link.getAttribute("href") ?? "")
      .filter((href) => href.includes("mega-altaria-ex-b1-102"));
    expect(hrefs).toEqual(["/ja/deck/mega-altaria-ex-b1-102"]);
    decksState.value = { decks: [], metaShareBySlug: {}, loading: false, error: null };
  });

  it("renders not found for a slug outside the archive", () => {
    renderAt("/deck/does-not-exist");
    expect(screen.getByText("not found page")).toBeTruthy();
  });
});
