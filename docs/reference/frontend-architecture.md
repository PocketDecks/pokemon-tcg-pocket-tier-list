# Frontend architecture

The frontend is a single-page React application built with Vite and TypeScript.
This page maps its structure: where the app mounts, how routes resolve, which
contexts hold state, which React Query keys carry data, and which pure helpers
do the work that needs no React. The shape of the data itself is covered in
[Card data](card-data-contract.md).

## Entry point

`src/index.tsx` imports `./i18n` for its side effects, then mounts `<App />`
into `#root`. It calls `createRoot().render()` rather than hydrating: the build
prerenders each route to static HTML, but language detection, auth state and
async data make the client's first paint diverge from that markup, so rendering
fresh replaces it cleanly in every language.

The same file registers a `vite:preloadError` listener. A deploy replaces every
hashed chunk, so an already-open tab asks for a filename the host no longer has
and dynamic import fails. The listener prevents the default error, reloads the
page once, and uses a `sessionStorage` stamp to keep that reload from looping
(more than one per ten seconds is ignored).

## Provider stack

Providers wrap the tree in two layers. In `src/index.tsx`, outside `App`, the
order is:

```text
StrictMode
BrowserRouter
UIProvider            src/contexts/UIContext.tsx
MissingContextProvider  src/components/MissingContext.tsx
FilterContextProvider   src/components/FilterContext.tsx
ThemeProvider          src/contexts/ThemeContext.tsx
GlobalStyles
ConsentProvider        src/consent/ConsentProvider.tsx
App
```

Inside `App` (`src/App.tsx`) a second layer adds the parts the routes need:

```text
ErrorBoundary
QueryClientProvider    queryClient created at module scope in App.tsx
AuthProvider           src/contexts/AuthContext.tsx
MetaWindowProvider     src/contexts/MetaWindowContext.tsx
DecksProvider          src/contexts/DecksContext.tsx
ContentReadyProvider   src/ads/ContentReadyContext.tsx
Routes
```

The `QueryClient` sets `staleTime` to one hour and `gcTime` to 24 hours, so a
payload fetched once stays fresh for the session.

Each route renders inside a second `ErrorBoundary` wrapped around the
`Suspense` boundary in `Layout`. A crash on one page leaves the shell standing.
The boundary resets when the pathname or search parameters change, so navigating
to another route or changing a view can recover without reloading. Failed lazy
route imports are retried on the next render.
`AdBlockerNotice` and `AdAnchor` sit outside that inner boundary so they render
regardless of page errors.

## Routing

All routes live in the table in `src/App.tsx`. Every page component is loaded
with `React.lazy` and rendered behind the layout's `Suspense` fallback,
`LoadingNotice` from `src/components/ErrorBoundary.tsx`.

The page routes are written once, in the `pageRoutes` fragment in
`src/App.tsx`. `App` mounts that fragment under one `Layout` route per entry in
`ROUTE_LOCALES`, at the path `LOCALE_PREFIXES` gives it (`/` and `/ja`). The
fragment stays a block of literal `<Route path="...">` elements because the
postbuild check `scripts/verify-dist-html.js` reads it as text and repeats it
under each prefix, to confirm every route resolves to a built page or a hosting
rule.

```text
/                          LandingPage        (index)
/tier-list                 TierListPage
/cards-list                CardsListPage
/expansion-list            ExpansionListPage  (index)
/expansion-list/:expansionId  ExpansionPage
/statistics                StatisticsPage
/privacy                   PrivacyPage
/about                     AboutPage
/feedback                  FeedbackPage
/deck                      DeckFinderPage     (index)
/deck/:deckId              DeckRoute
*                          NotFoundPage       (catch-all)
```

The same table repeats under `/ja`, for example `/ja/tier-list` and
`/ja/deck/:deckId`. `/stats` is not a route. Firebase Hosting redirects it to
`/statistics/`.

A deck URL's `deckId` segment is a `FullDeckType.id`, produced by `deckSlug`
from the deck name. `DeckRoute` decides what the segment shows:

- a deck in the current window renders `DeckDetailPage`;
- a retired variant whose hub has a different slug redirects to that hub;
- a hub slug renders `DeckHubPage`;
- a slug that only a premium window offers renders `DeckPremiumGate` for a
  free viewer, or switches a premium viewer to that window;
- any other slug renders `NotFoundPage`.

While the decks load it shows `DeckPageSkeleton`. If they fail to load, a known
variant still renders `DeckDetailPage` and a known hub still renders
`DeckHubPage`, so those pages can show their own error text.

`DeckDetailPage` finds its deck with `useDeckDetail`, which calls
`resolveDeckDetail` in `src/app/deck-resolution.ts` on the raw decks. After
resolution every consumer compares and indexes by `deck.id`; `rawDeckId` in
`deck-resolution.ts` is the one helper for matching a raw pipeline deck to a
slug.

## Data fetching

Every query that carries pipeline data is keyed by the meta window
(`10d`, `20d`, `30d` or `all`) so that switching windows reads a separate cache
entry. The `tier` part of a key is `full` for a premium viewer and `public`
otherwise. The `30d` and `all` windows are premium, and their queries stay
disabled until `useIsPremium` reports `true`.

| Key | Owner | Source |
| --- | --- | --- |
| `["decks", window]` | `DecksProvider`, `useDeckDetail` | `best-decks.json` |
| `["meta-share", window, tier]` | `DecksProvider` | `meta-share.json` |
| `["matchups", window, tier]` | `useMatchups` | `matchup-data.json` |
| `["card-scores"]` | `useCards` | `card-scores.json` |
| `["historical-trends"]` | `usePipelineTrends` | `historical-trends.json` |
| `["hub-file", hub]` | `useHubFile` | `hubs/{hub}.json` |
| `["premium", uid]`, `["entitlement", uid]` | `useIsPremium` | Firestore |

For the default window the file names have no suffix (`best-decks.json`). The
other windows add one (`best-decks-10d.json`). Premium windows load through
`src/app/premium-data.ts`. For meta share and matchups, a premium viewer on the
10-day or 20-day window reads the full artefact and falls back to the public one
when access is denied.

`DecksProvider` fetches only best decks and meta share. Matchup data is fetched
by the pages that show it, through `useMatchups`, so the provider's critical
path stays small. Share data is optional: any failure, including malformed JSON,
degrades to `null` so deck pages and statistics keep loading. The other queries
throw on failure and surface their errors through React Query as usual.

### Card and expansion data

Cards and expansions come from the `pokemon-tcg-pocket-cards` package and ship
inside the bundle, so no query loads them. `src/app/cards-api.ts` exports
`CARDS`, `CARDS_BY_ID` and `ATTACKS_BY_DECK_BUILDER_NR`, each computed once at
module load. `src/app/constants.ts` exports the raw package data as `RAW_CARDS`
and `ALL_EXPANSIONS`. `useExpansions()` returns the listed expansions
synchronously. Components and hooks read card names, images and attacks from
these values directly, and `buildFullLists` and `pickBestList` use the attack
index when they infer energy for each deck's best list.

## Contexts

Seven contexts hold client state. `AuthContext`, `DecksContext`,
`MetaWindowContext`, `ThemeContext` and `UIContext` live in `src/contexts/`. The
other two keep their provider components in `src/components/`
(`FilterContext.tsx`, `MissingContext.tsx`) with thin accessor hooks,
`useFilters` and `useMissing`, in `src/app/`. `useMetaWindow` and `useTheme`
are also in `src/app/`.

### DecksContext

`DecksProvider` joins the pipeline's partial decks against the card data.
`useDecks()` returns a union keyed by `status`:

| `status` | Fields |
| --- | --- |
| `"loading"` | `decks: null`, `scoreBaseline: null` |
| `"error"` | `decks: null`, `scoreBaseline: null`, `error` |
| `"ready"` | `decks`, `scoreBaseline` (null when no deck has a finite power score) |

Every variant also carries `rawDecks`, `metaShare`, `metaShareBySlug` and
`isPremium`. Pages test `status` once instead of checking `loading`, `error` and
`decks` separately. The state is `ready` whenever a deck list exists, `error`
when the query failed and there is none, and `loading` otherwise, including
while a premium window waits for the premium check. Consumers include
`TierListPage`, `DeckFinderPage`, `DeckDetailPage`, `DeckHubPage`,
`DeckRoute`, `StatisticsPage`, `ExpansionPage` and the landing components.

The join is `buildDecks` in `src/app/build-decks.ts`, run in one memo keyed on
the raw decks, filters and missing counts. Until the raw decks have loaded the
state has no deck list. Premium status does not enter the join; it only decides
which window queries are enabled. `src/app/deck-payload.ts` holds the pure
loaders and the shape checks for `best-decks.json`, `matchup-data.json` and
`meta-share.json`.
The steps, in order:

1. Filter each deck's lists with the predicates from `src/app/deck-filters.ts`:
   `findUnresolvedCardIds`, `isAffordable`, `matchesEnergy`,
   `matchesExFilter`, `hasEnoughLatestExpansionCards`.
2. Drop decks left with no lists, and decks whose primary icon card
   (`deckNameToIconIds(name)[0]`) is missing from the card data.
3. Sort by `percentOfGames` descending and slice to `deckAmount`.
4. Normalise `popularity` and `strength` against the observed maxima.
5. Resolve each partial deck with `resolveDeck` from
   `src/app/deck-resolution.ts`, the function `resolveDeckDetail` also uses for
   the detail page, then add the normalised `popularity` and `strength` and
   `percentOfGames` to make a `FullDeckType`. `resolveDeck` sets `id` with
   `deckSlug`, resolves icons from the name, and augments the best list with
   `energyIds` (`inferEnergyIds`) and a share code (`createDeckCode`). Energy
   inference and encoding run only when every card in the best list carries a
   `deckBuilderNr`; otherwise both fields stay empty.
6. Sort the finished decks with `getSortValue(b, sortBy)`.
7. When no energy filter is set, trim the single-Pokémon decks ranked below
   the lowest-ranked two-Pokémon deck (a name containing `&`), so at least one
   two-Pokémon deck always survives the cut.

Ids absent from the card data collect into one `console.warn` per render; that
warning is the signal that the pinned upstream tag has fallen behind the
pipeline output.

`metaShareBySlug` indexes the optional meta-share entries by their `name`
field, which matches a deck id, so movement tables can link on it.

### FilterContext

Holds the user-facing filter state consumed by `DecksContext` and `useCards`:
`energy` (element or null), `includeEx`, `deckAmount` (default
`FREE_DECK_AMOUNT`, 30), `sortBy` (a `SortBy` enum value, default
`SortBy.POWER`), `expansion` (set code or null) and `latestExpansionCards`
(minimum count from the newest set, or null). The enum and defaults are
exported from `src/components/FilterContext.tsx`.

### MissingContext

Tracks which cards the user does not own: `missing` is a flat array of card ids
where each copy counts as one entry. `addMissing(ids)` records a batch and
pushes it onto an undo history; `undoMissing()` pops the most recent batch.
`canUndo` and `lastRemovedId` support the undo control. `missingCounts` maps
each card id to the number of copies marked missing; the provider computes it
once. Consumed by `DecksContext`, `DeckDetailPage`, `DeckFinderPage` and `useCards`.

### UIContext

The smallest context: `isNavOpen` plus `toggleNav` for the navigation drawer.
Exports `UIProvider`, `useUI` and the raw `UIContext`.

### AuthContext

Wraps Firebase Auth: `user`, `loading`, `signInWithGoogle` (popup) and
`signOut`, backed by `auth` and `googleProvider` from
`src/config/firebase.ts`. The provider always renders its children, even while
auth is unresolved, so first paint never blocks on Firebase.

Premium status is not a context. `useIsPremium` in `src/app/use-is-premium.ts`
returns `true` when the user's own `entitlements/{uid}` document grants access
or when a Firestore Stripe subscription with the status `active`, `trialing` or
`past_due` exists, and `boolean | null` while it works. Trialing counts
because new subscribers spend their first seven days in a trial, and
`past_due` keeps access through Stripe's payment-retry grace period.
`DecksProvider` keeps the premium-window queries disabled until the answer is
`true`; the default window loads without waiting.

## Internationalisation

`src/i18n.ts` configures i18next with a custom backend plugin that imports
`./locales/${language}_${namespace}.json` lazily, so only the selected
language ships to the browser. `supportedLngs` lists eleven tags including
regional ones such as `zh-CN` and `zh-TW`; detection reads the navigator only
(no caching or persistence), and `fallbackLng` is `en`.

## Pure helpers

Everything under `src/app/` that is not a hook or the API layer is pure
TypeScript with no React dependency, so the tests exercise it without a
renderer.

| File | Exports | Consumed by |
| --- | --- | --- |
| `card-ref.ts` | `parseDeckListRef`, `parseScoreRef`, `setCode`, `CardRef` | `deck-filters.ts`, `use-cards.ts` |
| `deck-display.ts` | `NamedDeck`, `formatArchetypeId`, `deckDisplayName` | `DeckDetailPage`, `DeckHeadTags`, `StatisticsPage` |
| `deck-diff.ts` | `countById`, `ListDiff`, `diffLists`, `oneSwapAlternatives` | `DeckFinderPage`, `DeckDetailPage` |
| `deck-code.ts` | `TRAINER_OFFSET`, `SPECIAL_THRESHOLD`, `ENERGY_IDS`, `createDeckCode` | `DecksContext` |
| `deck-energy.ts` | `inferEnergyIds`, `EXCLUDED_DECK_BUILDER_NR`, `FORCED_LIGHTNING_NR` | `DecksContext` |
| `deck-filters.ts` | `cardToId`, `cardToCount`, `deckNameToIconIds`, `findUnresolvedCardIds`, `isAffordable`, `matchesEnergy`, `matchesExFilter`, `hasEnoughLatestExpansionCards` | `DecksContext` |
| `tier-helper.ts` | `buildTiers` | `TierGrid`, `use-deck-tiers.ts`, `MatrixSection` |
| `ranked-deck.ts` | `RankedDeck`, `isRanked`, `rankedDecks`, `sortRanked`, `comparePowerDescending` | `score-baseline.ts`, `use-deck-tiers.ts`, tier list, statistics and landing pages |
| `build-decks.ts` | `buildDecks`, `BuildOptions` | `DecksContext` |
| `deck-payload.ts` | `fetchBestDecks`, `parseBestDecks`, `fetchMatchupData`, `sanitiseMatchupData`, `loadMetaShare` | `DecksContext` |
| `deck-types.ts` | `FullDeckType`, `MatchupType` | `DecksContext`, `sorting-helper.ts` |
| `sort-by.ts` | `SortBy` | `DecksContext`, `FilterContext`, `sorting-helper.ts` |
| `sorting-helper.ts` | `getSortValue` | `DecksContext`, `TierListPage` |
| `deck-slug.ts` | re-exports `deckSlug` from `scripts/deck-slug.mjs` | `deck-resolution.ts`, `ShareDeckCode` |

Notes on individual files:

`card-ref.ts` parses both reference shapes the pipeline emits. Deck lists use
`"2:a1-004"` (`parseDeckListRef`); score rows use `"2 A1 004"`
(`parseScoreRef`). Both return the same `CardRef` of `{ id, count, set }`, so
callers never split these strings themselves.

`deck-diff.ts` compares lists card by card. `countById` turns a list into an
id-to-count map, `diffLists` produces added and removed entries, and
`oneSwapAlternatives` scores single-card swaps away from a deck's best list.
`diffLists` also serves `oneSwapAlternatives` internally.

`deck-slug.ts` is a one-line re-export. The slug formula lives in
`scripts/deck-slug.mjs`, authored as ESM so both `src/` and the build scripts
(that side requires it, which Node supports for ESM) share one definition.

The deck-code format, energy inference rules and fixture regeneration
procedure are documented separately in [Deck share codes](deck-share-codes.md).

## Related

[Pipeline output contract](pipeline-output-contract.md) documents the JSON
files under `public/data/` that the query layer fetches.
[Deploying and hosting](../how-to/deploying-and-hosting.md) covers what
happens to the built output after `yarn build`.
