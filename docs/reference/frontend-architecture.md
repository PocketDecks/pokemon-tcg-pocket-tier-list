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
GlobalStyles
ConsentProvider        src/consent/ConsentProvider.tsx
App
```

Inside `App` (`src/App.tsx`) a second layer adds the parts the routes need:

```text
ErrorBoundary
QueryClientProvider    queryClient created at module scope in App.tsx
AuthProvider           src/contexts/AuthContext.tsx
DecksProvider          src/contexts/DecksContext.tsx
ContentReadyProvider   src/ads/ContentReadyContext.tsx
Routes
```

The `QueryClient` sets `staleTime` to one hour and `gcTime` to 24 hours, so a
payload fetched once stays fresh for the session.

Each route renders inside a second `ErrorBoundary` wrapped around the
`Suspense` boundary in `Layout`. A crash on one page leaves the shell standing.
`AdBlockerNotice` and `AdAnchor` sit outside that inner boundary so they render
regardless of page errors.

## Routing

All routes live in the table in `src/App.tsx`. Every page component is loaded
with `React.lazy` and rendered behind the layout's `Suspense` fallback,
`LoadingNotice` from `src/components/ErrorBoundary.tsx`.

```text
/                    LandingPage      (index)
/tier-list           TierListPage
/cards-list          CardsListPage
/expansion-list      ExpansionListPage
/statistics          StatisticsPage
/stats               StatisticsPage   (alias of /statistics)
/privacy             PrivacyPage
/about               AboutPage
/404                 NotFoundPage
/deck                DeckFinderPage   (index)
/deck/:deckId        DeckDetailPage
*                    NotFoundPage     (catch-all)
```

A deck URL's `deckId` segment is a `FullDeckType.id`, produced by `deckSlug`
from the deck name. `DeckDetailPage` resolves it with
`decks?.find((d) => d.id === deckId)`.

## Data fetching

Four React Query keys exist.

| Key | Owner | Source |
| --- | --- | --- |
| `["cards"]` | shared | `fetchCards()` in `src/app/cards-api.ts` |
| `["decks"]` | `DecksProvider` | `best-decks.json`, `matchup-data.json`, `meta-share.json` |
| `["card-scores"]` | `useCards` | `card-scores.json` |
| `["expansions"]` | `useExpansions` | `EXPANSIONS_URL` from `src/app/constants.ts` |

`["cards"]` has two consumers, the `DecksProvider` in
`src/contexts/DecksContext.tsx` and `useCards` in `src/app/use-cards.ts`. Both
issue the same query, so React Query fetches once and shares the cache entry.

The `["decks"]` query fetches `best-decks.json` and `matchup-data.json` in
parallel and attaches `meta-share.json` through `loadMetaShare()`. Share data is
optional there: any failure, including malformed JSON, degrades to `null` so
deck pages and statistics keep loading. The other two queries throw on failure
and surface their errors through React Query as usual.

### The cards payload

`fetchCards()` returns a `CardsPayload`: `{ cards, attacksByDeckBuilderNr }`.
The attack index used to live in module scope and be filled by a side effect;
it now travels with the cards so no caller can read it before the fetch that
fills it. Consumers pull both fields out of the query data directly
(`cardsPayload?.cards`, `cardsPayload?.attacksByDeckBuilderNr`) instead of
calling getters, because the payload is plain cached value with no accessor
layer. `DecksContext` feeds the attack index into energy inference when it
builds each deck's best list.

## Contexts

Five contexts hold client state. `AuthContext`, `DecksContext` and `UIContext`
live in `src/contexts/`. The other two keep their provider components in
`src/components/` (`FilterContext.tsx`, `MissingContext.tsx`) with thin accessor
hooks, `useFilters` and `useMissing`, in `src/app/`.

### DecksContext

`DecksProvider` joins the pipeline's partial decks against the card data and
exposes `{ decks, metaShareBySlug, loading, error }` through `useDecks()`. Its
consumers are `TierListPage`, `DeckFinderPage`, `DeckDetailPage` and
`StatisticsPage`.

The join runs in one memo keyed on cards, decks, filters, missing counts and
premium status. Until cards, decks and premium status have all resolved it
returns `null`, which every consumer treats as still loading. The steps, in
order:

1. Filter each deck's lists with the predicates from `src/app/deck-filters.ts`:
   `findUnresolvedCardIds`, `isAffordable`, `matchesEnergy`,
   `matchesExFilter`, `hasEnoughLatestExpansionCards`.
2. Drop decks left with no lists, and decks whose primary icon card
   (`deckNameToIconIds(name)[0]`) is missing from the card data.
3. Sort by `percentOfGames` descending and slice to `deckAmount`.
4. Normalise `popularity` and `strength` against the observed maxima.
5. Map each partial deck to a `FullDeckType`: `id` via `deckSlug`, matchups
   looked up by name in the matchup data, icons resolved from the name, and a
   best list augmented with `energyIds` (`inferEnergyIds`) and a share code
   (`createDeckCode`). Energy inference and encoding run only when every card
   in the best list carries a `deckBuilderNr`; otherwise both fields stay empty.
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
`SortBy.SCORE`), `expansion` (set code or null) and `latestExpansionCards`
(minimum count from the newest set, or null). The enum and defaults are
exported from `src/components/FilterContext.tsx`.

### MissingContext

Tracks which cards the user does not own: `missing` is a flat array of card ids
where each copy counts as one entry. `addMissing(ids)` records a batch and
pushes it onto an undo history; `undoMissing()` pops the most recent batch.
`canUndo` and `lastRemovedId` support the undo control. Consumed by
`DecksContext` and `useCards`.

### UIContext

The smallest context: `isNavOpen` plus `toggleNav` for the navigation drawer.
Exports `UIProvider`, `useUI` and the raw `UIContext`.

### AuthContext

Wraps Firebase Auth: `user`, `loading`, `signInWithGoogle` (popup) and
`signOut`, backed by `auth` and `googleProvider` from
`src/config/firebase.ts`. The provider always renders its children, even while
auth is unresolved, so first paint never blocks on Firebase.

Premium status is not a context. `useIsPremium` in `src/app/use-is-premium.ts`
queries Firestore Stripe subscriptions with the statuses `active`, `trialing`
and `past_due`, returning `boolean | null` while it works. Trialing counts
because new subscribers spend their first seven days in a trial, and
`past_due` keeps access through Stripe's payment-retry grace period.
`DecksContext` waits for a non-null answer before computing decks.

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
| `deck-filters.ts` | `CardsMapping`, `cardToId`, `cardToCount`, `deckNameToIconIds`, `findUnresolvedCardIds`, `isAffordable`, `matchesEnergy`, `matchesExFilter`, `hasEnoughLatestExpansionCards` | `DecksContext` |
| `tier-helper.ts` | `buildTiers` | `TierGrid`, `StatisticsPage` |
| `deck-types.ts` | `FullDeckType`, `MatchupType` | `DecksContext`, `FilterContext`, `sorting-helper.ts` |
| `sort-by.ts` | `SortBy` | `DecksContext`, `FilterContext`, `sorting-helper.ts` |
| `sorting-helper.ts` | `getSortValue` | `DecksContext`, `TierListPage` |
| `deck-slug.ts` | re-exports `deckSlug` from `scripts/deck-slug.mjs` | `DecksContext`, `ShareDeckCode` |

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
