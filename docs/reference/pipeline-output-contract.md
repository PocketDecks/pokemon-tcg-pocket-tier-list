# Pipeline output contract

The five JSON files in `public/data/` carry everything the analysis pipeline
computes to the frontend. `analysis/src/get-best-decks.ts` writes all of them
on every run, with helpers in `analysis/src/utils/`. Their TypeScript shapes
live in `src/types/pipeline-data.ts`, which both `analysis/` and `src/`
compile against, so a field change fails a build instead of drifting quietly.

The consumer side of this contract is described in
[frontend-architecture.md](frontend-architecture.md).

## Qualification

A deck qualifies when it has at least one game and a win rate of at least
`MIN_WINRATE_THRESHOLD` (0.6, `analysis/src/settings.ts`). An archetype needs
at least `MIN_ARCHETYPE_QUALIFIED_GAMES` (25) qualified games before it is
ranked at all (`get-best-decks.ts` applies both filters). The dataset is also
restricted to decks dated on or after `EXPANSION_RELEASE_DATE`
(`analysis/src/utils/filter-decks.ts`). That date is derived in
`analysis/src/settings.ts` from the newest dated expansion in the
`pokemon-tcg-pocket-cards` package, so it moves with a package bump rather
than a manual edit.

Two consequences run through the whole contract. Lists and card scores are
computed from qualified decks only, so a widely played but weak archetype
contributes nothing to them and can read 0%. Matchup win rates are the one
exception: `get-best-decks.ts` computes them from all decks so that winrates
stay accurate for the population they describe.

## Card references

Card references appear in two string shapes:

- Deck lists use `"count:set-number"`, for example `"2:a1-004"`. Written by
  `convertCardsToIds` in `analysis/src/utils/convert-cards.ts`, parsed by
  `parseDeckListRef` in `src/app/card-ref.ts`.
- Card score rows use `"count Name Set Number"`, for example
  `2 Professor's Research PA 7`. Parsed by `parseScoreRef` in the same module,
  which lowercases the set code (`P-A` becomes `pa`) and pads the number to
  three digits.

Both parsers return the same `CardRef` object with `id`, `count` and `set`.
Callers never split these strings themselves.

## best-decks.json

Produced by `get-best-decks.ts`, which sorts the array by score descending
before writing it. Consumed by `DecksContext`, which fetches it together with
`matchup-data.json` under the query key `["decks"]`.

Top-level shape: `PipelinePartialDeck[]`, one entry per ranked archetype.

| Field | Type | Meaning |
| --- | --- | --- |
| `name` | string | Archetype name. Ends in the id of each icon card, joined by `&` for two-Pokémon decks; `deckNameToIconIds` in `src/app/deck-filters.ts` extracts them. |
| `lists` | `PipelineDeckList[]` | Distinct deck lists from qualified decks of this archetype, deduplicated by `getId`. Each holds `cards` (the `"count:set-number"` strings), `score` and `strength`. |
| `popularity` | number | Raw popularity from `calculateDeckScore` in `analysis/src/utils/calculate-deck-score.ts`. |
| `percentOfGames` | number | This archetype's share of all qualified games. |
| `score` | number | The score of the first list; the sort key. |

On the consumer side, `DecksContext` joins every list's cards against the card
data through `cardToId` and `cardToCount`, drops lists referencing ids missing
from the card data (one `console.warn` per render reports what was skipped),
and builds each deck's id with `deckSlug` from `scripts/deck-slug.mjs`.

## card-scores.json

Produced by `get-best-decks.ts`: it tallies win and game counts per card
across all qualified decks, scores them with `calculateCardScores` from
`analysis/src/utils/calculate-card-scores.ts` (a Wilson lower bound shrinks
small samples toward zero), sorts by score descending and writes the file.
Consumed by the `useCards` hook in `src/app/use-cards.ts` under the query key
`["card-scores"]`.

Top-level shape: `PipelineCardScore[]`, sorted by `score` descending.

| Field | Type | Meaning |
| --- | --- | --- |
| `name` | string | Score reference in the `"count Name Set Number"` shape above. |
| `score` | number | Shrinkage-adjusted playability score. |
| `popularity` | number | Shrinkage-adjusted share of qualified games the card appears in. |

`useCards` parses each row with `parseScoreRef`, joins against the `["cards"]`
payload by id, skips ids missing from the card data with a warning, and shows
the square root of `score` to the user.

## historical-trends.json

Produced by `buildTrends` in `analysis/src/utils/build-trends.ts`, called with
the sorted best-decks array so the first six archetypes are the top six.
Consumed by `StatisticsPage`, which fetches it directly in an effect and keeps
it in local state.

Top-level shape: `PipelineTrendRow[]`, one row per calendar day that has
qualified games, sorted by `date` ascending.

| Field | Type | Meaning |
| --- | --- | --- |
| `date` | string | Calendar day, `YYYY-MM-DD`. |
| *(archetype names)* | number | One dynamic key per top-six archetype name, holding that archetype's percentage (0 to 100) of the day's total qualified games. |

There is no fixed column list: `StatisticsPage` derives the series names from
the keys of the first row, excluding `date`. When the top six changes between
pipeline runs, older rows keep their own keys.

## matchup-data.json

Produced by `buildMatchupData` in `analysis/src/utils/build-matchup-data.ts`
from tallies that `calculateMatchupResults` computed over all decks, not just
qualified ones. Consumed by `DecksContext` in the same fetch as
best-decks.json.

Top-level shape: `Record<archetypeName, PipelineMatchupEntry[]>`. Keys match
the `name` values in best-decks.json, and only ranked archetypes have keys.

| Field | Type | Meaning |
| --- | --- | --- |
| `name` | string | Opponent archetype name, or the literal `Total` sentinel row appended last. |
| `winRate` | number | Wins divided by games against that opponent, 0 when no games were recorded. |
| `totalGames` | number | Games recorded against that opponent. |

`DecksContext` attaches each archetype's rows to its deck as `matchups`.
Consumers read aggregate numbers from the `Total` row: `sorting-helper.ts`'s
`getSortValue` uses its `winRate`, and `DeckDetailPage` reads it for the
matchup summary.

## meta-share.json

Produced by `buildMetaShare` in `analysis/src/utils/build-meta-share.ts`,
which counts qualified games per archetype over inclusive calendar-day windows
ending on the run date. Consumed twice: `DecksContext` loads it optionally
alongside the other two files (any failure degrades to `null` without blocking
deck pages), and `StatisticsPage` fetches it directly for the movement table.

Top-level shape: `PipelineMetaShare`.

| Field | Type | Meaning |
| --- | --- | --- |
| `generatedAt` | string | Run time as an ISO timestamp. |
| `windowDays` | number | Length of the comparison window, always 7 (`WINDOW_DAYS`). |
| `decks` | `MetaShareEntry[]` | One entry per tracked archetype, sorted by `share` descending. |

Each `MetaShareEntry` carries:

| Field | Type | Meaning |
| --- | --- | --- |
| `name` | string | Archetype name, identical to the corresponding best-decks entry. |
| `share` | number | Share of qualified games in the trailing 7-day window, 0 to 1. Both numerator and denominator count qualified games only. |
| `sharePrev` | number | Same measure for the window ending 7 days earlier. |
| `delta` | number | `share - sharePrev`; can be negative. |
| `games14` | number | Qualified games in the trailing 14-day window. A fresh expansion caps this in practice because the dataset starts at the expansion release date. |
| `firstSeen` | string | Earliest calendar day the archetype appears in the qualified pool. |
| `isNew` | boolean | True when `firstSeen` falls inside the current window. |

Coupling on `name`: `DecksContext` indexes the entries into `metaShareBySlug`
keyed by `name`, and `DeckDetailPage` looks that map up with the route's deck
id, which `deckSlug` produced by lowercasing the archetype name and replacing
whitespace runs with hyphens. The movement table links to
`/deck/${entry.name}/`, resolved the same way. Every lookup therefore works
only while each entry's `name` equals the slug of its archetype name, which
holds while pipeline names stay slug-shaped. `StatisticsPage` splits entries
into rising (`delta > 0.001`), falling (`delta < -0.001`) and new (`isNew`)
views for that table.
