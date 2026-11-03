import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import DeckHubPage from "../DeckHubPage";

vi.mock("../../../app/use-decks", () => ({
  useDecks: () => ({ decks: [], metaShareBySlug: {}, loading: false, error: null }),
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

  it("renders not found for a slug outside the archive", () => {
    renderAt("/deck/does-not-exist");
    expect(screen.getByText("not found page")).toBeTruthy();
  });
});
