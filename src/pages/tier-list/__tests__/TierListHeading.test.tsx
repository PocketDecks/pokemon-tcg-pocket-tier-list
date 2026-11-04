import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import i18n from "../../../i18n";
import TierListPage from "../TierListPage";
import { EXPANSIONS_URL } from "../../../app/constants";
import { newestExpansion } from "../../../app/expansion-policy.mjs";

vi.mock("../../../app/use-decks", () => ({
  useDecks: () => ({ decks: [], metaShareBySlug: null, loading: false, error: null }),
}));

vi.mock("../../../app/use-filters", () => ({
  default: () => ({
    energy: null,
    setEnergy: vi.fn(),
    includeEx: true,
    setIncludeEx: vi.fn(),
    deckAmount: 30,
    setDeckAmount: vi.fn(),
    sortBy: "power",
    setSortBy: vi.fn(),
    latestExpansionCards: null,
    setLatestExpansionCards: vi.fn(),
  }),
}));

vi.mock("../../../app/use-is-premium", () => ({ default: () => false }));
vi.mock("../../../ads/ContentReadyContext", () => ({ useMarkContentReady: vi.fn() }));
vi.mock("../../../ads/AdInContent", () => ({ default: () => null }));

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

describe("TierListPage heading", () => {
  it("names the newest expansion and its upper-cased id in the H1", () => {
    const latest = newestExpansion(EXPANSIONS_URL);
    expect(latest).toBeTruthy();
    render(
      <MemoryRouter>
        <TierListPage />
      </MemoryRouter>
    );
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      `${latest?.name} (${latest?.id.toUpperCase()}) Tier List`
    );
  });
});
