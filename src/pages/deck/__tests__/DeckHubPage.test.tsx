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

  it("renders not found for a slug outside the archive", () => {
    renderAt("/deck/does-not-exist");
    expect(screen.getByText("not found page")).toBeTruthy();
  });
});
