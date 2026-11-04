import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import i18n from "../../../i18n";
import DeckHubPage from "../DeckHubPage";
import { EXPANSIONS_URL } from "../../../app/constants";
import { newestExpansion } from "../../../app/expansion-policy.mjs";

const decksState = vi.hoisted(() => ({
  value: { decks: [] as unknown[] | null, metaShareBySlug: {}, loading: false, error: null as Error | null },
}));

const matchupsState = vi.hoisted(() => ({
  value: { matchupsByName: null as Record<string, unknown[]> | null, loading: false, error: null as Error | null },
}));

const cardsState = vi.hoisted(() => ({ value: null as unknown }));

const readiness = vi.hoisted(() => ({ markContentReady: vi.fn() }));

vi.mock("../../../app/use-decks", () => ({
  useDecks: () => decksState.value,
  useMatchups: () => matchupsState.value,
}));

vi.mock("../../../app/cards-api", () => ({
  fetchCards: () => Promise.resolve(cardsState.value),
}));

vi.mock("../../../ads/ContentReadyContext", () => ({
  useMarkContentReady: (ready: boolean) => readiness.markContentReady(ready),
}));

vi.mock("../../not-found/NotFoundPage", () => ({
  __esModule: true,
  default: () => <p>not found page</p>,
}));

const CARD_NAMES: Record<string, string> = {
  "b2b-007": "Mega Greninja ex",
  "b1-073": "Greninja",
  "a1-004": "Venusaur ex",
};

const CARD_PAYLOAD = {
  cards: Object.entries(CARD_NAMES).map(([id, name]) => ({ id, name })),
  attacksByDeckBuilderNr: new Map(),
};

const GRENINJA = "mega-greninja-ex-c1-042&greninja-ex-b1-073";
const VENUSAUR = "venusaur-ex-a1-004&bulbasaur-a1-001";

const GRENINJA_HUB = {
  hub: "mega-greninja-ex",
  name: "Mega Greninja ex",
  variants: [
    {
      variant: GRENINJA,
      name: "Mega Greninja ex-C1-042&Greninja ex-B1-073",
      firstSeen: "2025-10-31",
      lastSeen: "2026-11-02",
      peakShare: 0.13,
      peakDate: "2026-10-29",
      cards: ["2:b2b-007", "1:b1-073", "2:a1-004"],
    },
    {
      variant: "mega-greninja-ex-c1-042&greninja-a1-089",
      name: "Mega Greninja ex-C1-042&Greninja-A1-089",
      firstSeen: "2025-11-01",
      lastSeen: "2026-01-31",
      peakShare: 0.04,
      peakDate: "2025-12-01",
      cards: ["1:b2b-007"],
    },
  ],
};

const liveDeck = (name: string, powerScore: number, icons: [string, string | null], cardIds: string[] = []) => ({
  name,
  powerScore,
  expectedWinRate: 0.52,
  iconPrimary: { name: icons[0] },
  iconSecondary: icons[1] === null ? null : { name: icons[1] },
  bestList: { cards: cardIds.map((id) => ({ id })) },
});

const hubResponse = (body: unknown) =>
  body === undefined
    ? { ok: false, status: 404, statusText: "Not Found" }
    : { ok: true, json: () => Promise.resolve(body) };

const stubHubFiles = (files: Record<string, unknown>) =>
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      const hub = url.match(/\/data\/hubs\/([^/]+)\.json$/)?.[1] ?? "";
      return Promise.resolve(hubResponse(files[hub]) as unknown as Response);
    })
  );

const renderAt = (path: string) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/deck/:deckId" element={<DeckHubPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

beforeEach(() => {
  cardsState.value = CARD_PAYLOAD;
  stubHubFiles({ "mega-greninja-ex": GRENINJA_HUB });
  readiness.markContentReady.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  decksState.value = { decks: [], metaShareBySlug: {}, loading: false, error: null };
  matchupsState.value = { matchupsByName: null, loading: false, error: null };
});

describe("DeckHubPage", () => {
  it("renders a known hub from the deck route parameter", () => {
    renderAt("/deck/mega-greninja-ex");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Mega Greninja ex Deck");
    expect(screen.queryByText("not found page")).toBeNull();
  });

  it("translates the hub title into the active language", async () => {
    await i18n.changeLanguage("de");
    renderAt("/deck/mega-greninja-ex");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Mega Greninja ex-Deck");
    await i18n.changeLanguage("en");
  });

  it("does not claim the hub is out of meta when decks fail to load", () => {
    decksState.value = { decks: null, metaShareBySlug: {}, loading: false, error: new Error("offline") };
    renderAt("/deck/mega-greninja-ex");
    expect(screen.queryByText(/Not in the current/)).toBeNull();
  });

  it("lists live variants by power score, highest first, with unscored decks last", () => {
    decksState.value = {
      decks: [
        { name: "mega-altaria-ex-b1-102", powerScore: 40, expectedWinRate: 0.5 },
        { name: "mega-altaria-ex-b1-102&espeon-b3a-020", powerScore: null, expectedWinRate: 0.6 },
        { name: "mega-altaria-ex-b1-102&greninja-a1-089", powerScore: 70, expectedWinRate: 0.4 },
      ] as unknown[],
      metaShareBySlug: {},
      loading: false,
      error: null,
    };
    renderAt("/deck/mega-altaria-ex");
    const hrefs = screen
      .getAllByRole("link")
      .map((link) => link.getAttribute("href") ?? "")
      .filter((href) => href.startsWith("/deck/mega-altaria-ex-b1-102"));
    expect(hrefs).toEqual([
      "/deck/mega-altaria-ex-b1-102&greninja-a1-089",
      "/deck/mega-altaria-ex-b1-102",
      "/deck/mega-altaria-ex-b1-102&espeon-b3a-020",
    ]);
  });

  it("names a live variant with its resolved icon names, as the deck page does", () => {
    decksState.value = {
      decks: [
        {
          name: "mega-greninja-ex-c1-042&greninja-ex-b1-073",
          powerScore: 1,
          expectedWinRate: 0.5,
          iconPrimary: { name: "Mega Greninja ex" },
          iconSecondary: { name: "Greninja ex" },
        },
      ] as unknown[],
      metaShareBySlug: {},
      loading: false,
      error: null,
    };
    renderAt("/deck/mega-greninja-ex");
    expect(screen.getByText("Mega Greninja ex / Greninja ex")).toBeTruthy();
  });

  it("drops the card ID fragments from a live variant whose icons are missing", () => {
    decksState.value = {
      decks: [{ name: "mega-altaria-ex-b1-102", powerScore: 40, expectedWinRate: 0.5 }] as unknown[],
      metaShareBySlug: {},
      loading: false,
      error: null,
    };
    renderAt("/deck/mega-altaria-ex");
    expect(screen.getByText("Mega Altaria ex")).toBeTruthy();
    expect(screen.queryByText(/B1 102|B1-102/)).toBeNull();
  });

  it("keeps the locale on variant links", () => {
    decksState.value = {
      decks: [{ name: "mega-altaria-ex-b1-102", powerScore: 40, expectedWinRate: 0.5 }] as unknown[],
      metaShareBySlug: {},
      loading: false,
      error: null,
    };
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={["/ja/deck/mega-altaria-ex"]}>
          <Routes>
            <Route path="/ja/deck/:deckId" element={<DeckHubPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
    const hrefs = screen
      .getAllByRole("link")
      .map((link) => link.getAttribute("href") ?? "")
      .filter((href) => href.includes("mega-altaria-ex-b1-102"));
    expect(hrefs).toEqual(["/ja/deck/mega-altaria-ex-b1-102"]);
  });

  it("renders not found for a slug outside the archive", () => {
    renderAt("/deck/does-not-exist");
    expect(screen.getByText("not found page")).toBeTruthy();
  });
});

describe("DeckHubPage content", () => {
  const liveGreninja = liveDeck(GRENINJA, 70, ["Mega Greninja ex", "Greninja ex"]);

  it("lists the core cards of the strongest live variant with counts and names", async () => {
    decksState.value = { decks: [liveGreninja], metaShareBySlug: {}, loading: false, error: null };
    renderAt("/deck/mega-greninja-ex");
    expect(await screen.findByText("2 × Mega Greninja ex")).toBeTruthy();
    expect(screen.getByText("1 × Greninja")).toBeTruthy();
    expect(screen.getByText("2 × Venusaur ex")).toBeTruthy();
  });

  it("lists the cards of the most recently seen variant with cards when the hub is retired", async () => {
    renderAt("/deck/mega-greninja-ex");
    expect(await screen.findByText("2 × Mega Greninja ex")).toBeTruthy();
    expect(screen.queryByText("1 × Mega Greninja ex")).toBeNull();
  });

  it("shows the three best and three worst matchups, leaving out games below the minimum", async () => {
    decksState.value = {
      decks: [
        liveGreninja,
        liveDeck(VENUSAUR, 10, ["Venusaur ex", "Bulbasaur"]),
        liveDeck("greninja-b1-073", 5, ["Greninja", null]),
        liveDeck("zoroark-ex-b3-106", 3, ["Zoroark ex", null]),
      ],
      metaShareBySlug: {},
      loading: false,
      error: null,
    };
    matchupsState.value = {
      matchupsByName: {
        [GRENINJA]: [
          { name: VENUSAUR, winRate: 0.7, totalGames: 30 },
          { name: "greninja-b1-073", winRate: 0.2, totalGames: 25 },
          { name: "zoroark-ex-b3-106", winRate: 0.9, totalGames: 19 },
        ],
      },
      loading: false,
      error: null,
    };
    renderAt("/deck/mega-greninja-ex");
    expect(await screen.findByText("70.0% win rate")).toBeTruthy();
    expect(screen.getByText("Venusaur ex / Bulbasaur")).toBeTruthy();
    expect(screen.getByText("20.0% win rate")).toBeTruthy();
    expect(screen.queryByText(/Zoroark/)).toBeNull();
  });

  it("links up to three similar current decks from other hubs with their shared card counts", async () => {
    decksState.value = {
      decks: [
        liveGreninja,
        liveDeck(VENUSAUR, 10, ["Venusaur ex", "Bulbasaur"], ["a1-004", "b2b-007"]),
        liveDeck("greninja-b1-073", 5, ["Greninja", null], ["b1-073"]),
        liveDeck("zoroark-ex-b3-106", 3, ["Zoroark ex", null], ["a1-001"]),
      ],
      metaShareBySlug: {},
      loading: false,
      error: null,
    };
    renderAt("/deck/mega-greninja-ex");
    const venusaur = await screen.findByRole("link", { name: /Venusaur ex \/ Bulbasaur/ });
    expect(venusaur.getAttribute("href")).toBe(`/deck/${VENUSAUR}`);
    expect(screen.getByText("2 shared cards")).toBeTruthy();
    expect(screen.getByText("1 shared card")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Zoroark/ })).toBeNull();
  });

  it("lists every variant of the hub newest first, with its peak share and date", async () => {
    decksState.value = { decks: [liveGreninja], metaShareBySlug: {}, loading: false, error: null };
    renderAt("/deck/mega-greninja-ex");
    await screen.findByText(/Peak 13.0% on 29 Oct 2026/);
    const peaks = screen.getAllByText(/Peak /).map((node) => node.textContent?.split(" · ")[1]);
    expect(peaks).toEqual(["Peak 13.0% on 29 Oct 2026", "Peak 4.0% on 1 Dec 2025"]);
  });

  it("separates the seen range from the peak line in each history row", async () => {
    decksState.value = { decks: [liveGreninja], metaShareBySlug: {}, loading: false, error: null };
    renderAt("/deck/mega-greninja-ex");
    const meta = await screen.findByText(/Peak 13.0% on 29 Oct 2026/);
    expect(meta.textContent).toBe("Seen from 31 Oct 2025 to 2 Nov 2026 · Peak 13.0% on 29 Oct 2026");
  });

  it("writes the summary paragraph from the hub data and the live status", async () => {
    decksState.value = {
      decks: [liveGreninja],
      metaShareBySlug: { [GRENINJA]: { share: 0.1 } },
      loading: false,
      error: null,
    };
    renderAt("/deck/mega-greninja-ex");
    expect(await screen.findByText(/Mega Greninja ex is tracked on Top Pocket Decks in 2 variants/)).toBeTruthy();
    expect(screen.getByText(/Its first sighting was on 31 Oct 2025/)).toBeTruthy();
    expect(screen.getByText(/expected win rate of 52\.0% and a 10\.0% meta share/)).toBeTruthy();
  });

  it("states the last sighting and the current expansion when the hub has no live variant", async () => {
    renderAt("/deck/mega-greninja-ex");
    const expansion = newestExpansion(EXPANSIONS_URL)?.name;
    expect(expansion).toBeTruthy();
    expect(await screen.findByText(/was last seen on 2 Nov 2026/)).toBeTruthy();
    expect(document.body.textContent).toContain(`current meta for ${expansion}.`);
  });

  it("marks the content ready only once the hub file and the cards have loaded", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    renderAt("/deck/mega-greninja-ex");
    expect(readiness.markContentReady).not.toHaveBeenCalledWith(true);
    vi.unstubAllGlobals();
    stubHubFiles({ "mega-greninja-ex": GRENINJA_HUB });
    renderAt("/deck/mega-greninja-ex");
    await waitFor(() => expect(readiness.markContentReady).toHaveBeenLastCalledWith(true));
  });
});

describe("DeckHubPage tiny shares", () => {
  it("shows a peak share above zero and under 0.05% as under 0.1%", async () => {
    stubHubFiles({
      "mega-greninja-ex": {
        ...GRENINJA_HUB,
        variants: [
          { ...GRENINJA_HUB.variants[0], peakShare: 0.0002, peakDate: "2026-10-29" },
          { ...GRENINJA_HUB.variants[1], peakShare: 0.0001, peakDate: "2025-12-01" },
        ],
      },
    });
    renderAt("/deck/mega-greninja-ex");
    expect(await screen.findByText(/Peak <0.1% on 29 Oct 2026/)).toBeTruthy();
    expect(screen.getByText(/Peak <0.1% on 1 Dec 2025/)).toBeTruthy();
    expect(screen.getByText(/peak share was <0\.1% on 29 Oct 2026/)).toBeTruthy();
  });
});

describe("DeckHubPage landmarks", () => {
  it("renders no main element of its own inside the layout's main", () => {
    decksState.value = { decks: [], metaShareBySlug: {}, loading: false, error: null };
    const { container } = render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <main>
          <MemoryRouter initialEntries={["/deck/mega-greninja-ex"]}>
            <Routes>
              <Route path="/deck/:deckId" element={<DeckHubPage />} />
            </Routes>
          </MemoryRouter>
        </main>
      </QueryClientProvider>
    );
    expect(container.querySelectorAll("main")).toHaveLength(1);
  });
});

describe("DeckHubPage dates in UTC", () => {
  it("shows a UTC calendar day whatever the local time zone", async () => {
    const previous = process.env.TZ;
    process.env.TZ = "America/Los_Angeles";
    try {
      stubHubFiles({
        "mega-greninja-ex": {
          ...GRENINJA_HUB,
          variants: [
            {
              ...GRENINJA_HUB.variants[0],
              firstSeen: "2026-03-05",
              lastSeen: "2026-03-05",
              peakShare: 0.05,
              peakDate: "2026-03-05",
            },
            GRENINJA_HUB.variants[1],
          ],
        },
      });
      renderAt("/deck/mega-greninja-ex");
      expect(await screen.findByText(/Seen from 5 Mar 2026 to 5 Mar 2026 · Peak 5\.0% on 5 Mar 2026/)).toBeTruthy();
    } finally {
      if (previous === undefined) delete process.env.TZ;
      else process.env.TZ = previous;
    }
  });
});
