import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import ExpansionListPage from "../ExpansionListPage";
import { useMarkContentReady } from "../../../ads/ContentReadyContext";

const state = vi.hoisted(() => ({
  cards: [] as unknown[],
  expansions: [] as unknown[],
}));

vi.mock("../../../app/use-cards", () => ({
  __esModule: true,
  default: () => state.cards,
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

  it("does not mark ready when the dataset has no tiles to show", () => {
    state.cards = [];
    state.expansions = [expansion];
    render(
      <MemoryRouter>
        <ExpansionListPage />
      </MemoryRouter>
    );

    expect(lastReady()).toBe(false);
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
});
