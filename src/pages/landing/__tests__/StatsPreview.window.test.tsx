import { beforeAll, describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import StatsPreview from "../StatsPreview";
import { DecksProvider, useDecks } from "../../../contexts/DecksContext";
import rawCards from "../../../app/__fixtures__/cards.json";
import i18n from "../../../i18n";

vi.mock("../../../app/use-is-premium", () => ({ __esModule: true, default: () => false }));
vi.mock("../../../app/use-expansions", () => ({
  __esModule: true,
  default: () => [],
  latestCoveredExpansion: () => null,
}));

const GOOD_DECK = "venusaur-a1-004&bulbasaur-a1-001";
const OTHER_DECK = "missingno-a1-999";

const decks = [
  { name: GOOD_DECK, lists: [{ cards: ["2:a1-004", "1:a1-219"], score: 10, strength: 5 }], percentOfGames: 50, popularity: 100 },
];

const jsonResponse = (body: unknown) =>
  Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as unknown as Response);

const Loaded = () => {
  const { decks: loadedDecks, metaShare } = useDecks();
  return <p>{loadedDecks && metaShare ? "loaded" : "loading"}</p>;
};

const renderWithWindow = (metaShareDecks: unknown[]) => {
  vi.spyOn(global, "fetch").mockImplementation((input) => {
    const url = String(input);
    if (url.endsWith("best-decks.json")) return jsonResponse(decks);
    if (url.endsWith("meta-share.json"))
      return jsonResponse({ generatedAt: "2026-08-24T00:00:00Z", windowDays: 20, decks: metaShareDecks });
    return jsonResponse(rawCards);
  });
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <DecksProvider>
          <StatsPreview />
          <Loaded />
        </DecksProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
};

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("StatsPreview with a meta window", () => {
  it("renders no Rising panel when every deck in the window is new", async () => {
    renderWithWindow([
      { name: GOOD_DECK, share: 0.1, sharePrev: 0, delta: 0.1, windowGames: 100, firstSeen: "2026-10-30", isNew: true },
    ]);
    await waitFor(() => expect(screen.getByText("loaded")).toBeTruthy());
    expect(screen.queryByRole("link", { name: /Rising/ })).toBeNull();
  });

  it("lists the rising decks when the window is mixed", async () => {
    renderWithWindow([
      { name: GOOD_DECK, share: 0.12, sharePrev: 0.1, delta: 0.02, windowGames: 100, firstSeen: "2026-01-01", isNew: false },
      { name: OTHER_DECK, share: 0.05, sharePrev: 0, delta: 0.05, windowGames: 100, firstSeen: "2026-10-30", isNew: true },
    ]);
    await waitFor(() => expect(screen.getByText("loaded")).toBeTruthy());
    expect(await screen.findByRole("link", { name: /Rising/ })).toBeTruthy();
  });
});

Loaded.displayName = "Loaded";
