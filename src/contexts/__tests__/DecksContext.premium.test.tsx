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

const PREMIUM_DECK = "venusaur-a1-004&bulbasaur-a1-001";
const PUBLIC_DECK = "altaria-b1-102&swablu-a4-064";

const deck = (name: string) => ({
  name,
  lists: [{ cards: ["2:a1-004", "1:a1-219"], score: 10, strength: 5 }],
  percentOfGames: 50,
  popularity: 100,
});

const jsonResponse = (body: unknown) =>
  Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as unknown as Response);

const Probe = () => {
  const { decks, loading } = useDecks();
  const { window } = useMetaWindow();
  return (
    <div>
      <p data-testid="window">{window}</p>
      <p data-testid="decks">
        {loading || !decks ? "loading" : decks.map((entry) => entry.name).join(",")}
      </p>
    </div>
  );
};

const MatchupProbe = () => {
  const { matchupsByName } = useMatchups();
  return <p data-testid="matchups">{matchupsByName ? Object.keys(matchupsByName).join(",") : "none"}</p>;
};

let requestedUrls: string[];

const renderOn = (initialWindow: "20d" | "30d" | "all", children: React.ReactNode = <Probe />) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MetaWindowProvider initialWindow={initialWindow}>
        <DecksProvider>{children}</DecksProvider>
      </MetaWindowProvider>
    </QueryClientProvider>
  );

beforeEach(() => {
  premium.isPremium = null;
  requestedUrls = [];
  premium.loadPremiumArtefact.mockImplementation(async (name: string) => {
    if (name.startsWith("best-decks")) return [deck(PREMIUM_DECK)];
    if (name.startsWith("meta-share")) return { decks: [] };
    return { [PREMIUM_DECK]: [{ name: "Total", winRate: 0.5, totalGames: 10 }] };
  });
  vi.spyOn(global, "fetch").mockImplementation((input) => {
    const url = String(input);
    requestedUrls.push(url);
    if (url.includes("best-decks")) return jsonResponse([deck(PUBLIC_DECK)]);
    if (url.includes("meta-share")) return jsonResponse({ decks: [] });
    return jsonResponse(rawCards);
  });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("premium window queries", () => {
  it.each([null, false])(
    "runs no premium-window query while isPremium is %s",
    async (value) => {
      premium.isPremium = value;
      renderOn("30d", (
        <>
          <Probe />
          <MatchupProbe />
        </>
      ));

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(premium.loadPremiumArtefact).not.toHaveBeenCalled();
      expect(requestedUrls.some((url) => /-(30d|all)\.json$/.test(url))).toBe(false);
    }
  );

  it("loads the premium window artefacts through the premium loader once premium is confirmed", async () => {
    premium.isPremium = true;
    renderOn("30d", (
      <>
        <Probe />
        <MatchupProbe />
      </>
    ));

    expect(await screen.findByText(PREMIUM_DECK)).toBeInTheDocument();
    expect(await screen.findByTestId("matchups")).toHaveTextContent(PREMIUM_DECK);
    expect(premium.loadPremiumArtefact).toHaveBeenCalledWith("best-decks-30d");
    expect(premium.loadPremiumArtefact).toHaveBeenCalledWith("meta-share-30d");
    expect(premium.loadPremiumArtefact).toHaveBeenCalledWith("matchup-data-30d");
    expect(requestedUrls.some((url) => /-(30d|all)\.json$/.test(url))).toBe(false);
  });

  it("still loads the default window for a free viewer", async () => {
    premium.isPremium = false;
    renderOn("20d");

    expect(await screen.findByText(PUBLIC_DECK)).toBeInTheDocument();
    expect(premium.loadPremiumArtefact).not.toHaveBeenCalled();
  });

  it("degrades meta share to null when the premium load fails", async () => {
    premium.isPremium = true;
    premium.loadPremiumArtefact.mockImplementation(async (name: string) => {
      if (name.startsWith("meta-share")) throw new Error("offline");
      return [deck(PREMIUM_DECK)];
    });
    renderOn("30d");

    expect(await screen.findByText(PREMIUM_DECK)).toBeInTheDocument();
  });
});

describe("premium access failure", () => {
  it("falls back to the default window after a PremiumAccessError", async () => {
    premium.isPremium = true;
    premium.loadPremiumArtefact.mockRejectedValue(new PremiumAccessError("best-decks-30d"));
    renderOn("30d");

    await waitFor(() => expect(screen.getByTestId("window")).toHaveTextContent("20d"));
    expect(await screen.findByText(PUBLIC_DECK)).toBeInTheDocument();
  });

  it("keeps a premium window when a load fails for another reason", async () => {
    premium.isPremium = true;
    premium.loadPremiumArtefact.mockRejectedValue(new Error("offline"));
    renderOn("30d");

    await waitFor(() => expect(premium.loadPremiumArtefact).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(screen.getByTestId("window")).toHaveTextContent("30d");
  });
});
