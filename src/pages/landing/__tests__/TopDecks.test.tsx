import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import i18n from "../../../i18n";
import TopDecks from "../TopDecks";
import { rankDeckTiers } from "../../../app/use-deck-tiers";
import { deckDisplayName } from "../../../app/deck-display";
import { EXPANSIONS_URL } from "../../../app/constants";
import { newestExpansion } from "../../../app/expansion-policy.mjs";

const decks = vi.hoisted(() => ({ value: [] as unknown[] }));

vi.mock("../../../app/use-decks", () => ({
  useDecks: () => ({ decks: decks.value, metaShareBySlug: null, loading: false, error: null }),
}));

const deck = (index: number) => ({
  id: `deck-${index}`,
  name: `deck-${index}`,
  lists: [],
  bestList: { cards: [], score: 0, energyIds: [], deckCode: null },
  score: 0,
  popularity: 0,
  strength: 0,
  expectedWinRate: 0.5 + index / 100,
  fieldCoverage: 0.9,
  powerScore: 100 - index * 9,
  freqScore: 0,
  metaScore: null,
  percentOfGames: 0.01,
  iconPrimary: { id: `icon-${index}`, name: `Icon ${index}`, image: "" },
  iconSecondary: null,
});

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

describe("TopDecks", () => {
  it("lists the ten highest-ranked decks in tier order with tier, name, win rate and link", () => {
    decks.value = Array.from({ length: 12 }, (_, index) => deck(index));
    const expected = rankDeckTiers(decks.value as never[]).flatMap((tier) =>
      [...tier.decks].sort((a, b) => (b.powerScore ?? -1) - (a.powerScore ?? -1)).map((d) => ({ tier: tier.label, deck: d }))
    ).slice(0, 10);

    render(
      <MemoryRouter>
        <TopDecks />
      </MemoryRouter>
    );

    const newest = newestExpansion(EXPANSIONS_URL);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(`Top ${newest?.name} decks`);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(10);
    items.forEach((item, index) => {
      const scope = within(item);
      expect(scope.getByText(expected[index].tier)).toBeTruthy();
      expect(scope.getByRole("link", { name: deckDisplayName(expected[index].deck as never) }).getAttribute("href")).toBe(
        `/deck/${expected[index].deck.id}`
      );
      expect(scope.getByText(`${(expected[index].deck.expectedWinRate * 100).toFixed(1)}% win rate`)).toBeTruthy();
    });
    expect(screen.getByRole("link", { name: "Full tier list" }).getAttribute("href")).toBe("/tier-list/");
  });

  it("renders nothing while there are no ranked decks", () => {
    decks.value = [];
    const { container } = render(
      <MemoryRouter>
        <TopDecks />
      </MemoryRouter>
    );
    expect(container.innerHTML).toBe("");
  });
});
