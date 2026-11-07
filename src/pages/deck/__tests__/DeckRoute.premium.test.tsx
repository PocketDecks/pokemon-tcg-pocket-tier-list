import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import DeckRoute from "../DeckRoute";

const PREMIUM_ONLY = "mega-altaria-ex-b1-102&bonsly-b3-078";
const LATE_ONLY = "old-a1-009";

const state = vi.hoisted(() => ({
  decks: [] as { name: string }[] | null,
  loading: false,
  error: null as Error | null,
  premium: false as boolean | null,
  window: "20d" as "10d" | "20d" | "30d" | "all",
  setWindow: vi.fn(),
}));

vi.mock("../../../data/premium-deck-slugs.json", () => ({
  default: {
    "mega-altaria-ex-b1-102&bonsly-b3-078": ["30d", "all"],
    "old-a1-009": ["all"],
  },
}));

vi.mock("../../../app/use-decks", () => ({
  useDecks: () => ({
    decks: state.decks,
    loading: state.loading,
    error: state.error,
    isPremium: state.premium,
  }),
}));

vi.mock("../../../app/use-meta-window", () => ({
  useMetaWindow: () => ({ window: state.window, setWindow: state.setWindow }),
}));

vi.mock("../DeckDetailPage", () => ({ __esModule: true, default: () => <p>live deck page</p> }));
vi.mock("../DeckHubPage", () => ({ __esModule: true, default: () => <p>hub page</p> }));
vi.mock("../DeckPageSkeleton", () => ({ __esModule: true, default: () => <p>skeleton</p> }));
vi.mock("../DeckPremiumGate", () => ({ __esModule: true, default: () => <p>premium gate</p> }));
vi.mock("../../not-found/NotFoundPage", () => ({ __esModule: true, default: () => <p>not found page</p> }));

const tree = (path: string) => (
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/deck/:deckId" element={<DeckRoute />} />
    </Routes>
  </MemoryRouter>
);

const renderAt = (path: string) => render(tree(path));

beforeEach(() => {
  state.decks = [{ name: "garchomp-a2-123" }];
  state.loading = false;
  state.error = null;
  state.premium = false;
  state.window = "20d";
  state.setWindow.mockReset();
});

describe("DeckRoute for a deck only the premium windows offer", () => {
  it("shows the premium gate to a free viewer instead of a 404", () => {
    renderAt(`/deck/${PREMIUM_ONLY}`);

    expect(screen.getByText("premium gate")).toBeTruthy();
    expect(screen.queryByText("not found page")).toBeNull();
    expect(state.setWindow).not.toHaveBeenCalled();
  });

  it("shows the gate while the free viewer's decks have not resolved", () => {
    state.decks = null;
    renderAt(`/deck/${PREMIUM_ONLY}`);

    expect(screen.getByText("premium gate")).toBeTruthy();
  });

  it("shows the gate to a free viewer after the decks fail to load", () => {
    state.decks = null;
    state.error = new Error("offline");
    renderAt(`/deck/${PREMIUM_ONLY}`);

    expect(screen.getByText("premium gate")).toBeTruthy();
  });

  it("keeps the skeleton while premium status is unknown", () => {
    state.premium = null;
    state.decks = null;
    renderAt(`/deck/${PREMIUM_ONLY}`);

    expect(screen.getByText("skeleton")).toBeTruthy();
    expect(screen.queryByText("premium gate")).toBeNull();
    expect(screen.queryByText("not found page")).toBeNull();
    expect(state.setWindow).not.toHaveBeenCalled();
  });

  it("keeps the skeleton while the decks are loading", () => {
    state.loading = true;
    state.decks = null;
    renderAt(`/deck/${PREMIUM_ONLY}`);

    expect(screen.getByText("skeleton")).toBeTruthy();
  });

  it("moves a premium viewer to the first window that offers the deck", () => {
    state.premium = true;
    state.setWindow.mockImplementation((next: typeof state.window) => {
      state.window = next;
      state.decks = [{ name: PREMIUM_ONLY }];
    });
    const view = renderAt(`/deck/${PREMIUM_ONLY}`);

    expect(state.setWindow).toHaveBeenCalledTimes(1);
    expect(state.setWindow).toHaveBeenCalledWith("30d");
    view.rerender(tree(`/deck/${PREMIUM_ONLY}`));
    expect(screen.getByText("live deck page")).toBeTruthy();
    expect(screen.queryByText("not found page")).toBeNull();
  });

  it("moves a premium viewer from a window that lacks the deck to the one that has it", () => {
    state.premium = true;
    state.window = "30d";
    renderAt(`/deck/${LATE_ONLY}`);

    expect(state.setWindow).toHaveBeenCalledWith("all");
  });

  it("renders the deck once the selected window offers it", () => {
    state.premium = true;
    state.window = "30d";
    state.decks = [{ name: PREMIUM_ONLY }];
    renderAt(`/deck/${PREMIUM_ONLY}`);

    expect(screen.getByText("live deck page")).toBeTruthy();
    expect(state.setWindow).not.toHaveBeenCalled();
  });

  it("renders the deck for a free viewer when the free window offers it", () => {
    state.decks = [{ name: PREMIUM_ONLY }];
    renderAt(`/deck/${PREMIUM_ONLY}`);

    expect(screen.getByText("live deck page")).toBeTruthy();
  });

  it("does not switch again when a listed window is already selected", () => {
    state.premium = true;
    state.window = "all";
    renderAt(`/deck/${LATE_ONLY}`);

    expect(state.setWindow).not.toHaveBeenCalled();
    expect(screen.getByText("not found page")).toBeTruthy();
  });

  it("shows the gate instead of looping when the premium window fell back", () => {
    state.premium = true;
    const view = renderAt(`/deck/${PREMIUM_ONLY}`);
    expect(state.setWindow).toHaveBeenCalledTimes(1);

    view.rerender(tree(`/deck/${PREMIUM_ONLY}`));

    expect(screen.getByText("premium gate")).toBeTruthy();
    expect(state.setWindow).toHaveBeenCalledTimes(1);
  });
});

describe("DeckRoute unknown slugs", () => {
  it("still renders the not-found page for a free viewer", () => {
    renderAt("/deck/does-not-exist");

    expect(screen.getByText("not found page")).toBeTruthy();
    expect(screen.queryByText("premium gate")).toBeNull();
  });

  it("still renders the not-found page for a premium viewer", () => {
    state.premium = true;
    renderAt("/deck/does-not-exist");

    expect(screen.getByText("not found page")).toBeTruthy();
    expect(state.setWindow).not.toHaveBeenCalled();
  });

  it("still renders the not-found page while premium status is unknown", () => {
    state.premium = null;
    state.decks = null;
    renderAt("/deck/does-not-exist");

    expect(screen.getByText("not found page")).toBeTruthy();
  });

  it("does not treat object prototype keys as premium decks", () => {
    renderAt("/deck/constructor");

    expect(screen.getByText("not found page")).toBeTruthy();
  });

  it("still sends a known hub to the hub page", () => {
    renderAt("/deck/garchomp");

    expect(screen.getByText("hub page")).toBeTruthy();
  });
});
