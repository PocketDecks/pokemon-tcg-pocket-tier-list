import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DecksProvider, useMatchups } from "../DecksContext";
import { MetaWindowProvider, useMetaWindow } from "../MetaWindowContext";
import { useDecks } from "../../app/use-decks";
import rawCards from "../../app/__fixtures__/cards.json";

vi.mock("../../app/use-is-premium", () => ({
  __esModule: true,
  default: () => true,
}));

vi.mock("../../app/use-expansions", () => ({
  __esModule: true,
  default: () => [],
}));

const GOOD_DECK = "venusaur-a1-004&bulbasaur-a1-001";
const TEN_DAY_DECK = "altaria-b1-102&swablu-a4-064";

const deck = (name: string) => ({
  name,
  lists: [{ cards: ["2:a1-004", "1:a1-219"], score: 10, strength: 5 }],
  percentOfGames: 50,
  popularity: 100,
});

const decks = [deck(GOOD_DECK)];
const tenDayDecks = [deck(TEN_DAY_DECK)];

const matchups = {
  [GOOD_DECK]: [{ name: "Total", winRate: 0.5, totalGames: 10 }],
};

const jsonResponse = (body: unknown) =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve(body),
  } as unknown as Response);

const DeckProbe = () => {
  const { decks: resolved, loading } = useDecks();
  if (loading || !resolved) return <p>loading</p>;
  return <p>{resolved.map((deck) => deck.name).join(",")}</p>;
};

const MatchupProbe = () => {
  const { matchupsByName, loading } = useMatchups();
  if (loading) return <p>matchups-loading</p>;
  return <p>{matchupsByName ? Object.keys(matchupsByName).join(",") : "none"}</p>;
};

const WindowSwitch = () => {
  const { window, setWindow } = useMetaWindow();
  return (
    <div>
      <p data-testid="window">{window}</p>
      <button onClick={() => setWindow("10d")}>to-10d</button>
      <button onClick={() => setWindow("20d")}>to-20d</button>
    </div>
  );
};

let requestedUrls: string[];

// staleTime mirrors the app's QueryClient: the point of the test below is that
// a window switch back reuses the cache instead of refetching.
const renderWithWindow = (children: React.ReactNode) =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false, staleTime: 1000 * 60 * 60 },
          },
        })
      }
    >
      <MetaWindowProvider>
        <DecksProvider>{children}</DecksProvider>
      </MetaWindowProvider>
    </QueryClientProvider>
  );

beforeEach(() => {
  requestedUrls = [];
  vi.spyOn(global, "fetch").mockImplementation((input) => {
    const url = String(input);
    requestedUrls.push(url);
    if (url.includes("best-decks-10d")) return jsonResponse(tenDayDecks);
    if (url.includes("best-decks")) return jsonResponse(decks);
    if (url.includes("meta-share")) return jsonResponse({ decks: [] });
    if (url.includes("matchup-data")) return jsonResponse(matchups);
    return jsonResponse(rawCards);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("window-aware deck fetching", () => {
  it("opens on the 20-day window and reads the un-suffixed artefacts", async () => {
    renderWithWindow(
      <>
        <WindowSwitch />
        <DeckProbe />
      </>
    );

    expect(await screen.findByText(GOOD_DECK)).toBeInTheDocument();
    expect(screen.getByTestId("window")).toHaveTextContent("20d");
    expect(requestedUrls).toContain("/data/best-decks.json");
    expect(requestedUrls).toContain("/data/meta-share.json");
  });

  it("swaps the artefact URLs when the window changes", async () => {
    const user = userEvent.setup();
    renderWithWindow(
      <>
        <WindowSwitch />
        <DeckProbe />
      </>
    );

    await screen.findByText(GOOD_DECK);
    await user.click(screen.getByRole("button", { name: "to-10d" }));

    expect(await screen.findByTestId("window")).toHaveTextContent("10d");
    expect(await screen.findByText(TEN_DAY_DECK)).toBeInTheDocument();
    expect(requestedUrls).toContain("/data/best-decks-10d.json");
    expect(requestedUrls).toContain("/data/meta-share-10d.json");
  });

  it("reuses the cached 20-day artefacts when the window returns", async () => {
    const user = userEvent.setup();
    renderWithWindow(
      <>
        <WindowSwitch />
        <DeckProbe />
      </>
    );

    await screen.findByText(GOOD_DECK);
    await user.click(screen.getByRole("button", { name: "to-10d" }));
    await screen.findByText(TEN_DAY_DECK);
    await user.click(screen.getByRole("button", { name: "to-20d" }));
    await screen.findByText(GOOD_DECK);

    expect(
      requestedUrls.filter((url) => url.endsWith("best-decks.json"))
    ).toHaveLength(1);
  });

  it("does not pull matchup data into the provider's required fetch set", async () => {
    renderWithWindow(<DeckProbe />);

    await screen.findByText(GOOD_DECK);
    expect(requestedUrls.some((url) => url.includes("matchup-data"))).toBe(false);
  });
});

describe("window-aware matchup fetching", () => {
  it("reads the window's matchup artefact", async () => {
    const user = userEvent.setup();
    renderWithWindow(
      <>
        <WindowSwitch />
        <MatchupProbe />
      </>
    );

    await user.click(screen.getByRole("button", { name: "to-10d" }));

    expect(await screen.findByText(GOOD_DECK)).toBeInTheDocument();
    expect(requestedUrls).toContain("/data/matchup-data-10d.json");
  });
});
