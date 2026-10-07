import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DecksProvider, useDecks, useMatchups } from "../DecksContext";
import rawCards from "../../app/__fixtures__/cards.json";

// The only dependency that reaches for Firebase.
vi.mock("../../app/use-is-premium", () => ({
  __esModule: true,
  default: () => true,
}));

vi.mock("../../app/use-expansions", () => ({
  __esModule: true,
  default: () => [],
}));

// a1-999 is the drifted id: it has no entry in the fixture.
const GOOD_DECK = "venusaur-a1-004&bulbasaur-a1-001";
const DRIFTED_DECK = "missingno-a1-999";

const decks = [
  {
    name: GOOD_DECK,
    lists: [{ cards: ["2:a1-004", "1:a1-219"], score: 10, strength: 5 }],
    percentOfGames: 50,
    popularity: 100,
  },
  {
    name: DRIFTED_DECK,
    lists: [{ cards: ["2:a1-999", "1:a1-219"], score: 9, strength: 4 }],
    percentOfGames: 40,
    popularity: 90,
  },
];



const jsonResponse = (body: unknown) =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve(body),
  } as unknown as Response);

// A non-OK response exercises DecksContext's `!response.ok` guard (it throws,
// which react-query surfaces as an error rather than a hanging loader).
const errorResponse = (status: number, statusText: string) =>
  Promise.resolve({
    ok: false,
    status,
    statusText,
    json: () => Promise.resolve({}),
  } as unknown as Response);

const ErrorProbe = () => {
  const { loading, error } = useDecks();
  if (loading) return <p>loading</p>;
  if (error) return <p>{error.message}</p>;
  return <p>loaded</p>;
};

const MatchupsProbe = () => {
  const { matchupsByName, loading, error } = useMatchups();
  if (loading) return <p>matchups-loading</p>;
  if (error) return <p>{error.message}</p>;
  return <p>{matchupsByName ? Object.keys(matchupsByName).join(",") : "no-matchups"}</p>;
};

const DeckNames = () => {
  const { decks, loading } = useDecks();
  if (loading || !decks) return <p>loading</p>;
  return (
    <ul>
      {decks.map((deck) => (
        <li key={deck.id}>{deck.name}</li>
      ))}
    </ul>
  );
};

const DeckPopularities = () => {
  const { decks, loading } = useDecks();
  if (loading || !decks) return <p>loading</p>;
  return (
    <ul>
      {decks.map((deck) => (
        <li key={deck.id}>{deck.popularity}</li>
      ))}
    </ul>
  );
};

const renderProvider = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <DecksProvider>
        <DeckNames />
      </DecksProvider>
    </QueryClientProvider>
  );

describe("DecksProvider with a drifted card id", () => {
  let consoleWarn: MockInstance;

  beforeEach(() => {
    consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(global, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.endsWith("best-decks.json")) return jsonResponse(decks);

      if (url.endsWith("meta-share.json"))
        return jsonResponse({
          generatedAt: "2026-08-24T00:00:00Z",
          windowDays: 7,
          decks: [],
        });
      return jsonResponse(rawCards);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("still mounts and renders the decks it could resolve", async () => {
    renderProvider();

    expect(await screen.findByText(GOOD_DECK)).toBeInTheDocument();
  });

  it("drops the deck referencing the unresolvable card", async () => {
    renderProvider();

    await screen.findByText(GOOD_DECK);
    expect(screen.queryByText(DRIFTED_DECK)).not.toBeInTheDocument();
  });

  it("keeps an unpaired deck when no paired decks exist", async () => {
    const unpairedDeck = GOOD_DECK.replace("&", "/");
    vi.spyOn(global, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.endsWith("best-decks.json"))
        return jsonResponse([{ ...decks[0], name: unpairedDeck }]);

      if (url.endsWith("meta-share.json"))
        return jsonResponse({ generatedAt: "2026-08-24T00:00:00Z", windowDays: 7, decks: [] });
      return jsonResponse(rawCards);
    });

    renderProvider();

    expect(await screen.findByText(unpairedDeck)).toBeInTheDocument();
  });

  it("keeps decks loading when only the meta-share fetch rejects", async () => {
    vi.spyOn(global, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.endsWith("meta-share.json")) return Promise.reject(new Error("network down"));
      if (url.endsWith("best-decks.json")) return jsonResponse(decks);

      return jsonResponse(rawCards);
    });

    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <DecksProvider>
          <DeckNames />
        </DecksProvider>
      </QueryClientProvider>
    );

    expect(await screen.findByText(GOOD_DECK)).toBeInTheDocument();
  });

  it("treats malformed JSON in a 200 meta-share response as absent", async () => {
    vi.spyOn(global, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.endsWith("best-decks.json")) return jsonResponse(decks);

      if (url.endsWith("meta-share.json"))
        return jsonResponse({ generatedAt: "nope" }); // missing decks array
      return jsonResponse(rawCards);
    });

    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <DecksProvider>
          <DeckNames />
        </DecksProvider>
      </QueryClientProvider>
    );

    expect(await screen.findByText(GOOD_DECK)).toBeInTheDocument();
  });

  it("warns once, naming the id it skipped", async () => {
    renderProvider();

    await waitFor(() => expect(consoleWarn).toHaveBeenCalled());
    expect(consoleWarn).toHaveBeenCalledWith(
      expect.stringContaining("a1-999")
    );
  });
});

describe("DecksProvider critical-path requests", () => {
  afterEach(() => vi.restoreAllMocks());

  it("does not request matchup data while rendering the provider", async () => {
      const requestedUrls: string[] = [];
      vi.spyOn(global, "fetch").mockImplementation((input) => {
        const url = String(input);
        requestedUrls.push(url);
        if (url.endsWith("best-decks.json")) return jsonResponse(decks);
        if (url.endsWith("meta-share.json")) return jsonResponse({ decks: [] });
        return jsonResponse(rawCards);
      });
      renderProvider();
      await screen.findByText(GOOD_DECK);
      expect(requestedUrls.some((url) => url.endsWith("matchup-data.json"))).toBe(false);
    });

    it("starts best-decks and meta-share requests before either resolves", async () => {
      let releaseBestDecks!: () => void;
      let releaseMetaShare!: () => void;
      const started = new Promise<void>((resolve) => {
        vi.spyOn(global, "fetch").mockImplementation((input) => {
          const url = String(input);
          if (url.endsWith("best-decks.json")) {
            return new Promise((resolveResponse) => {
              releaseBestDecks = () => resolveResponse(jsonResponse(decks));
              resolve();
            });
          }
          if (url.endsWith("meta-share.json")) {
            return new Promise((resolveResponse) => {
              releaseMetaShare = () => resolveResponse(jsonResponse({ decks: [] }));
            });
          }
          return jsonResponse(rawCards);
        });
      });
      renderProvider();
      await started;
      expect(releaseMetaShare).toBeTypeOf("function");
      releaseBestDecks();
      releaseMetaShare();
      expect(await screen.findByText(GOOD_DECK)).toBeInTheDocument();
    });
    });


describe("DecksProvider with a failed fetch", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("ends loading and exposes the error on a non-OK response", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(global, "fetch").mockImplementation((input) =>
      errorResponse(500, "Internal Server Error")
    );

    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <DecksProvider>
          <ErrorProbe />
        </DecksProvider>
      </QueryClientProvider>
    );

    expect(await screen.findByText("Failed to fetch best-decks.json: 500 Internal Server Error")).toBeInTheDocument();
  });
});

describe("DecksProvider with every deck at zero popularity", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exposes popularity 0 instead of NaN", async () => {
    const zeroPopularityDecks = [
      {
        name: GOOD_DECK,
        lists: [{ cards: ["2:a1-004", "1:a1-219"], score: 10, strength: 5 }],
        percentOfGames: 50,
        popularity: 0,
      },
    ];
    vi.spyOn(global, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.endsWith("best-decks.json"))
        return jsonResponse(zeroPopularityDecks);

      if (url.endsWith("meta-share.json"))
        return jsonResponse({
          generatedAt: "2026-08-24T00:00:00Z",
          windowDays: 7,
          decks: [],
        });
      return jsonResponse(rawCards);
    });

    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <DecksProvider>
          <DeckPopularities />
        </DecksProvider>
      </QueryClientProvider>
    );

    const item = await screen.findByText("0");
    expect(item.textContent).not.toBe("NaN");
  });
});

describe("useMatchups", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const renderMatchups = () =>
    render(
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: { queries: { retry: false, retryDelay: 0 } },
          })
        }
      >
        <MatchupsProbe />
      </QueryClientProvider>
    );

  it("returns the matchup map from its query", async () => {
    vi.spyOn(global, "fetch").mockImplementation(() =>
      jsonResponse({ "test-deck": [{ name: "Total", winRate: 0.5, totalGames: 10 }] })
    );
    renderMatchups();
    expect(await screen.findByText("test-deck")).toBeInTheDocument();
  });

  it("exposes a fetch error without throwing past the hook", async () => {
    vi.spyOn(global, "fetch").mockImplementation(() =>
      errorResponse(500, "Internal Server Error")
    );
    renderMatchups();
    expect(
      await screen.findByText("Failed to fetch matchup-data.json: 500 Internal Server Error")
    ).toBeInTheDocument();
  });

  it("exposes an error when the body is an array", async () => {
    vi.spyOn(global, "fetch").mockImplementation(() =>
      jsonResponse([{ name: "test-deck" }])
    );
    renderMatchups();
    expect(
      await screen.findByText("matchup-data.json has an unexpected shape")
    ).toBeInTheDocument();
  });
});
