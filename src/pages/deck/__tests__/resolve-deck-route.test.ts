import { describe, expect, it } from "vitest";
import { resolveDeckRoute, type DeckRouteInput } from "../resolve-deck-route";

const DECK = "garchomp-a2-123";
const PREMIUM_ONLY = "mega-altaria-ex-b1-102&bonsly-b3-078";
const LIVE = { id: DECK };

const base: DeckRouteInput = {
  deckId: DECK,
  status: "ready",
  decks: [LIVE],
  isPremium: false,
  premiumWindows: [],
  window: "20d",
  switchedFor: null,
  entryHub: null,
  hubHasDecks: false,
};

const premium = (overrides: Partial<DeckRouteInput>): Partial<DeckRouteInput> => ({
  deckId: PREMIUM_ONLY,
  decks: [],
  premiumWindows: ["30d", "all"],
  ...overrides,
});

type Row = [name: string, overrides: Partial<DeckRouteInput>, kind: string, switchTo?: "30d" | "all"];

const rows: Row[] = [
  // Loading
  ["skeleton while the decks load", { status: "loading", decks: null }, "skeleton"],
  ["skeleton while loading, even for a live variant", { status: "loading" }, "skeleton"],
  [
    "skeleton while loading, and still asks for the window switch",
    premium({ status: "loading", isPremium: true, window: "20d" }),
    "skeleton",
    "30d",
  ],

  // Supporter-only decks (no live offer, a premium window lists them)
  ["skeleton while premium status is unknown", premium({ isPremium: null, decks: null }), "skeleton"],
  ["gate for a free viewer", premium({ isPremium: false }), "gate"],
  ["gate for a free viewer when decks fail to load", premium({ isPremium: false, decks: null }), "gate"],
  ["detail when a live window offers the deck", premium({ isPremium: false, decks: [{ id: PREMIUM_ONLY }] }), "detail"],
  [
    "detail for a premium viewer when the selected window offers the deck",
    premium({ isPremium: true, window: "30d", decks: [{ id: PREMIUM_ONLY }] }),
    "detail",
  ],
  [
    "switches a premium viewer to the first listed window",
    premium({ isPremium: true, window: "20d" }),
    "skeleton",
    "30d",
  ],
  [
    "switches a premium viewer from an unlisted window when decks have not resolved",
    premium({ isPremium: true, window: "20d", decks: null }),
    "skeleton",
    "30d",
  ],
  [
    "switches from a window that lacks the deck to the one that lists it",
    { deckId: "old-a1-009", premiumWindows: ["all"], isPremium: true, window: "30d" },
    "skeleton",
    "all",
  ],
  [
    "does not switch when a listed window is already selected",
    { deckId: "old-a1-009", premiumWindows: ["all"], isPremium: true, window: "all" },
    "not-found",
  ],
  [
    "gates instead of looping once the switch has been made for this deck",
    premium({ isPremium: true, window: "20d", switchedFor: PREMIUM_ONLY }),
    "gate",
  ],
  [
    "switches again for a different deck than the one switched for before",
    premium({ isPremium: true, window: "20d", switchedFor: "other-deck" }),
    "skeleton",
    "30d",
  ],
  [
    "a premium viewer on a listed window with no offer falls through to not-found",
    premium({ isPremium: true, window: "30d" }),
    "not-found",
  ],
  [
    "a premium-only deck with decks unresolved and a listed window falls through to not-found",
    premium({ isPremium: true, window: "30d", decks: null }),
    "not-found",
  ],

  // Decks not loaded (decks === null)
  ["detail for a live variant when decks fail", { decks: null, entryHub: "garchomp" }, "detail"],
  [
    "detail for a retired variant when decks fail (no redirect while decks are unknown)",
    { deckId: "umbreon-ex-a4-112&greninja-a1-089", decks: null, entryHub: "umbreon-ex" },
    "detail",
  ],
  ["hub for a known hub when decks fail", { decks: null, hubHasDecks: true }, "hub"],
  ["not-found for an unknown slug when decks fail", { decks: null }, "not-found"],

  // Decks loaded
  ["detail for a live variant", { entryHub: "garchomp" }, "detail"],
  [
    "detail for a live variant even when its archive hub differs",
    { deckId: DECK, entryHub: "other-hub", hubHasDecks: true },
    "detail",
  ],
  [
    "redirect a retired variant to its hub",
    { deckId: "umbreon-ex-a4-112&greninja-a1-089", entryHub: "umbreon-ex", hubHasDecks: true },
    "redirect",
  ],
  ["hub for a known hub", { deckId: "garchomp", decks: [LIVE], hubHasDecks: true }, "hub"],
  [
    "hub for a hub whose own entry points at it",
    { deckId: "garchomp", entryHub: "garchomp", hubHasDecks: true },
    "hub",
  ],
  ["not-found for anything else", { deckId: "does-not-exist" }, "not-found"],
  ["not-found for an unknown slug that looks like a prototype key", { deckId: "constructor" }, "not-found"],
  ["free viewer on a live variant ignores premium state", { isPremium: null, entryHub: "garchomp" }, "detail"],
];

describe("resolveDeckRoute", () => {
  it.each(rows)("%s", (_name, overrides, kind, switchTo) => {
    const result = resolveDeckRoute({ ...base, ...overrides });

    expect(result.kind).toBe(kind);
    expect(result.switchTo).toBe(switchTo ?? null);
  });
});
