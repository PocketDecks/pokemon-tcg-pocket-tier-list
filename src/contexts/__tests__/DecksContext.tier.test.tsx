import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DecksProvider, useMatchups } from "../DecksContext";
import { MetaWindowProvider, useMetaWindow } from "../MetaWindowContext";
import { useDecks } from "../../app/use-decks";
import rawCards from "../../app/__fixtures__/cards.json";

const premium = vi.hoisted(() => ({
  isPremium: null as boolean | null,
  loadPremiumArtefact: vi.fn(),
}));

vi.mock("../../app/use-is-premium", () => ({
  __esModule: true,
  default: () => premium.isPremium,
}));

vi.mock("../../app/use-expansions", () => ({
  __esModule: true,
  default: () => [],
}));

vi.mock("../../app/premium-data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../app/premium-data")>();
  return { ...actual, loadPremiumArtefact: premium.loadPremiumArtefact };
});

import { PremiumAccessError } from "../../app/premium-data";

const DECK = "venusaur-a1-004&bulbasaur-a1-001";
const OPPONENT = "altaria-b1-102&swablu-a4-064";

const bestDeck = {
  name: DECK,
  lists: [{ cards: ["2:a1-004", "1:a1-219"], score: 10, strength: 5 }],
  percentOfGames: 50,
  popularity: 100,
};

const row = (name: string, totalGames: number) => ({ name, winRate: 0.6, totalGames });

const PUBLIC_MATCHUPS = { [DECK]: [row("Total", 10)] };
const FULL_MATCHUPS = { [DECK]: [row(OPPONENT, 7), row("Total", 10)] };

const PUBLIC_SHARE = { generatedAt: "x", windowDays: 20, decks: [{ name: DECK, share: 0.2, windowGames: 9 }] };
const FULL_SHARE = {
  generatedAt: "x",
  windowDays: 20,
  decks: [
    { name: DECK, share: 0.2, sharePrev: 0.1, delta: 0.1, windowGames: 9, firstSeen: "2026-01-01", isNew: false },
  ],
};

const jsonResponse = (body: unknown) =>
  Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as unknown as Response);

const Probe = () => {
  const { metaShare } = useDecks();
  const { window } = useMetaWindow();
  const { matchupsByName } = useMatchups();
  return (
    <div>
      <p data-testid="window">{window}</p>
      <p data-testid="rows">{matchupsByName?.[DECK]?.length ?? "none"}</p>
      <p data-testid="delta">{metaShare ? String(metaShare.decks[0]?.delta) : "none"}</p>
    </div>
  );
};

let requestedUrls: string[];
let client: QueryClient;

const tree = (initialWindow: "10d" | "20d") => (
  <QueryClientProvider client={client}>
    <MetaWindowProvider initialWindow={initialWindow}>
      <DecksProvider>
        <Probe />
      </DecksProvider>
    </MetaWindowProvider>
  </QueryClientProvider>
);

const queryKeys = () => client.getQueryCache().getAll().map((query) => query.queryKey);

beforeEach(() => {
  premium.isPremium = null;
  requestedUrls = [];
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  premium.loadPremiumArtefact.mockImplementation(async (name: string) =>
    name.startsWith("matchup-data") ? FULL_MATCHUPS : FULL_SHARE
  );
  vi.spyOn(global, "fetch").mockImplementation((input) => {
    const url = String(input);
    requestedUrls.push(url);
    if (url.includes("best-decks")) return jsonResponse([bestDeck]);
    if (url.includes("matchup-data")) return jsonResponse(PUBLIC_MATCHUPS);
    if (url.includes("meta-share")) return jsonResponse(PUBLIC_SHARE);
    return jsonResponse(rawCards);
  });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("matchup and meta share tiers", () => {
  it("reads the public files for a free viewer and keys the queries as public", async () => {
    premium.isPremium = false;
    render(tree("20d"));

    await waitFor(() => expect(screen.getByTestId("rows")).toHaveTextContent("1"));
    await waitFor(() => expect(screen.getByTestId("delta")).toHaveTextContent("undefined"));

    expect(requestedUrls).toContain("/data/matchup-data.json");
    expect(requestedUrls).toContain("/data/meta-share.json");
    expect(premium.loadPremiumArtefact).not.toHaveBeenCalled();
    expect(queryKeys()).toContainEqual(["matchups", "20d", "public"]);
    expect(queryKeys()).toContainEqual(["meta-share", "20d", "public"]);
  });

  it("reads the full artefacts for a premium viewer and keys the queries as full", async () => {
    premium.isPremium = true;
    render(tree("20d"));

    await waitFor(() => expect(screen.getByTestId("rows")).toHaveTextContent("2"));
    await waitFor(() => expect(screen.getByTestId("delta")).toHaveTextContent("0.1"));

    expect(premium.loadPremiumArtefact).toHaveBeenCalledWith("matchup-data-20d");
    expect(premium.loadPremiumArtefact).toHaveBeenCalledWith("meta-share-20d");
    expect(requestedUrls).toContain("/data/best-decks.json");
    expect(requestedUrls).not.toContain("/data/matchup-data.json");
    expect(requestedUrls).not.toContain("/data/meta-share.json");
    expect(queryKeys()).toContainEqual(["matchups", "20d", "full"]);
    expect(queryKeys()).toContainEqual(["meta-share", "20d", "full"]);
  });

  it("uses the public files while premium is unknown, then the full ones", async () => {
    premium.isPremium = null;
    const view = render(tree("20d"));

    await waitFor(() => expect(screen.getByTestId("rows")).toHaveTextContent("1"));
    expect(premium.loadPremiumArtefact).not.toHaveBeenCalled();

    premium.isPremium = true;
    view.rerender(tree("20d"));

    await waitFor(() => expect(screen.getByTestId("rows")).toHaveTextContent("2"));
    expect(premium.loadPremiumArtefact).toHaveBeenCalledWith("matchup-data-20d");
  });

  it.each(["10d", "20d"] as const)(
    "falls back to the public file without leaving the %s window when the full artefact is denied",
    async (window) => {
      premium.isPremium = true;
      premium.loadPremiumArtefact.mockRejectedValue(new PremiumAccessError("matchup-data"));
      render(tree(window));

      await waitFor(() => expect(screen.getByTestId("rows")).toHaveTextContent("1"));
      await waitFor(() => expect(screen.getByTestId("delta")).toHaveTextContent("undefined"));

      expect(screen.getByTestId("window")).toHaveTextContent(window);
    }
  );
});
