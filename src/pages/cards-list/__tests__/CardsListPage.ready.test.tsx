import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import CardsListPage from "../CardsListPage";
import { useMarkContentReady } from "../../../ads/ContentReadyContext";

const state = vi.hoisted(() => ({
  cards: [] as unknown[],
  error: null as Error | null,
}));

vi.mock("../../../app/use-cards", () => ({
  __esModule: true,
  default: () => ({ cards: state.error ? null : state.cards, error: state.error, retry: vi.fn() }),
}));

vi.mock("../../../app/use-expansions", () => ({
  __esModule: true,
  default: () => [],
}));

vi.mock("../../../ads/ContentReadyContext", () => ({
  __esModule: true,
  useMarkContentReady: vi.fn(),
}));

vi.mock("../../../components/CardIcon", () => ({
  default: ({ card }: { card: { name: string } }) => <span>{card.name}</span>,
}));

vi.mock("../../../components/LastUpdated", () => ({
  default: () => <span>Updated</span>,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const lastReady = () => {
  const calls = vi.mocked(useMarkContentReady).mock.calls;
  return calls[calls.length - 1]?.[0];
};

describe("CardsListPage content readiness", () => {
  beforeEach(() => {
    vi.mocked(useMarkContentReady).mockClear();
  });

  it("marks ready on a valid empty score list", () => {
    state.cards = [];
    state.error = null;
    render(
      <MemoryRouter>
        <CardsListPage />
      </MemoryRouter>
    );

    expect(lastReady()).toBe(true);
  });

  it("marks ready on a score-load error so prerender does not hang", () => {
    state.cards = [];
    state.error = new Error("Card score request failed with status 500");
    render(
      <MemoryRouter>
        <CardsListPage />
      </MemoryRouter>
    );

    expect(lastReady()).toBe(true);
    state.error = null;
  });
});
