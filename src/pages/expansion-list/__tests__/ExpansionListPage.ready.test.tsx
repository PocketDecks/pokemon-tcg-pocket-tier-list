import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import ExpansionListPage from "../ExpansionListPage";
import { useMarkContentReady } from "../../../ads/ContentReadyContext";

const state = vi.hoisted(() => ({
  cards: [] as unknown[],
  expansions: [] as unknown[],
  error: null as Error | null,
}));

vi.mock("../../../app/use-cards", () => ({
  __esModule: true,
  default: () => ({ cards: state.error ? null : state.cards, error: state.error, retry: vi.fn() }),
}));

vi.mock("../../../app/use-expansions", () => ({
  __esModule: true,
  default: () => state.expansions,
}));

vi.mock("../../../ads/ContentReadyContext", () => ({
  __esModule: true,
  useMarkContentReady: vi.fn(),
}));

const expansion = {
  id: "b4a",
  name: "Team Rocket's Ambition",
  release_date: "2026-08-27",
  packs: [{ id: "b4a-booster", name: "Booster", image: "b4a.webp" }],
};

const lastReady = () => {
  const calls = vi.mocked(useMarkContentReady).mock.calls;
  return calls[calls.length - 1]?.[0];
};

describe("ExpansionListPage content readiness", () => {
  beforeEach(() => {
    vi.mocked(useMarkContentReady).mockClear();
  });

  it("marks ready on a valid empty score list", () => {
    state.cards = [];
    state.expansions = [expansion];
    render(
      <MemoryRouter>
        <ExpansionListPage />
      </MemoryRouter>
    );

    expect(lastReady()).toBe(true);
  });

  it("marks ready once tiles are visible", () => {
    state.cards = [{ id: "b4a-001", name: "Volbeat", set: "b4a", pack: "Booster", score: 0.8 }];
    state.expansions = [expansion];
    render(
      <MemoryRouter>
        <ExpansionListPage />
      </MemoryRouter>
    );

    expect(lastReady()).toBe(true);
  });

  it("marks ready on a score-load error so prerender does not hang", () => {
    state.cards = [];
    state.error = new Error("Card score request failed with status 500");
    state.expansions = [expansion];
    render(
      <MemoryRouter>
        <ExpansionListPage />
      </MemoryRouter>
    );

    expect(lastReady()).toBe(true);
    state.error = null;
  });
});
