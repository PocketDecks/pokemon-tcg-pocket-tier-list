import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import DeckRoute from "../DeckRoute";

const decksState = vi.hoisted(() => ({
  value: { decks: [] as { name: string }[] | null, loading: false, error: null as Error | null },
}));

vi.mock("../../../app/use-decks", () => ({
  useDecks: () => decksState.value,
}));

vi.mock("../DeckDetailPage", () => ({
  __esModule: true,
  default: () => <p>live deck page</p>,
}));

vi.mock("../DeckHubPage", () => ({
  __esModule: true,
  default: () => <p>hub page</p>,
}));

vi.mock("../../not-found/NotFoundPage", () => ({
  __esModule: true,
  default: () => <p>not found page</p>,
}));

const PathProbe = () => <p data-testid="path">{useLocation().pathname}</p>;

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/deck/:deckId"
          element={
            <>
              <DeckRoute />
              <PathProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>
  );

describe("DeckRoute", () => {
  it("renders the detail page for a live variant", () => {
    decksState.value = { decks: [{ name: "garchomp-a2-123" }], loading: false, error: null };
    renderAt("/deck/garchomp-a2-123");
    expect(screen.getByText("live deck page")).toBeTruthy();
    expect(screen.getByTestId("path").textContent).toBe("/deck/garchomp-a2-123");
  });

  it("replaces a retired variant with its hub", () => {
    decksState.value = { decks: [{ name: "garchomp-a2-123" }], loading: false, error: null };
    renderAt("/deck/umbreon-ex-a4-112&greninja-a1-089");
    expect(screen.getByText("hub page")).toBeTruthy();
    expect(screen.getByTestId("path").textContent).toBe("/deck/umbreon-ex");
  });

  it("renders the hub page for a known hub", () => {
    decksState.value = { decks: [{ name: "garchomp-a2-123" }], loading: false, error: null };
    renderAt("/deck/garchomp");
    expect(screen.getByText("hub page")).toBeTruthy();
    expect(screen.getByTestId("path").textContent).toBe("/deck/garchomp");
  });

  it("renders the not-found page for anything else", () => {
    decksState.value = { decks: [{ name: "garchomp-a2-123" }], loading: false, error: null };
    renderAt("/deck/does-not-exist");
    expect(screen.getByText("not found page")).toBeTruthy();
  });

  it("renders the not-found page for an unknown slug when decks fail to load", () => {
    decksState.value = { decks: null, loading: false, error: new Error("offline") };
    renderAt("/deck/does-not-exist");
    expect(screen.getByText("not found page")).toBeTruthy();
  });

  it("renders the detail page for a known variant when decks fail to load", () => {
    decksState.value = { decks: null, loading: false, error: new Error("offline") };
    renderAt("/deck/garchomp-a2-123");
    expect(screen.getByText("live deck page")).toBeTruthy();
    expect(screen.getByTestId("path").textContent).toBe("/deck/garchomp-a2-123");
  });
});
