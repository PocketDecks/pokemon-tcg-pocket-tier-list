import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import i18n from "../../../i18n";
import TopDecks from "../TopDecks";

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

const EXPECTED = [
  { tier: "S", name: "Icon 0", href: "/deck/deck-0", win: "50.0% win rate" },
  { tier: "S", name: "Icon 1", href: "/deck/deck-1", win: "51.0% win rate" },
  { tier: "A", name: "Icon 2", href: "/deck/deck-2", win: "52.0% win rate" },
  { tier: "A", name: "Icon 3", href: "/deck/deck-3", win: "53.0% win rate" },
  { tier: "B", name: "Icon 4", href: "/deck/deck-4", win: "54.0% win rate" },
  { tier: "B", name: "Icon 5", href: "/deck/deck-5", win: "55.0% win rate" },
  { tier: "C", name: "Icon 6", href: "/deck/deck-6", win: "56.0% win rate" },
  { tier: "C", name: "Icon 7", href: "/deck/deck-7", win: "57.0% win rate" },
  { tier: "D", name: "Icon 8", href: "/deck/deck-8", win: "58.0% win rate" },
  { tier: "D", name: "Icon 9", href: "/deck/deck-9", win: "59.0% win rate" },
];

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

describe("TopDecks", () => {
  it("orders the top ten by tier then power score, whatever the input order", () => {
    decks.value = Array.from({ length: 12 }, (_, index) => deck(11 - index));

    render(
      <MemoryRouter>
        <TopDecks />
      </MemoryRouter>
    );

    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Top Dual Fusion decks");
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(10);
    items.forEach((item, index) => {
      const scope = within(item);
      expect(scope.getByText(EXPECTED[index].tier)).toBeTruthy();
      expect(scope.getByRole("link", { name: EXPECTED[index].name }).getAttribute("href")).toBe(EXPECTED[index].href);
      expect(scope.getByText(EXPECTED[index].win)).toBeTruthy();
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
