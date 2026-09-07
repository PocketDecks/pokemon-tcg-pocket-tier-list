# How-to guide: Updating archetypes and expansions

The meta shifts when players discover new decks or new cards are released. You maintain the tier list by refreshing the scraped pairing file and, when a set drops, confirming the release date the package reports.

## Where archetype names come from

Deck names come from `analysis/src/data/limitless-pairings.json`, which `analysis/scripts/sync-pairings.mjs` scrapes from Limitless. `get-deck-name.ts` reads that file as its only source. There is no hand-maintained archetype list.

To pick up new pairings, run the scraper from `analysis/`:

```
yarn sync-pairings
```

Each run only adds. Partners merge onto an existing primary and nothing is pruned, so the file accumulates every pairing ever seen.

A few archetypes never appear on Limitless. Those are seeded in `SEED_PRIMARIES` in the scraper so a rebuild does not lose them. Add to that list if a real deck has no pairing anywhere on the site.

## How a name is chosen

The matcher scores every pairing whose primary card is in the deck, then picks the best.

A partner qualifies when the deck runs two of it, or when it is the same species split across printings (Magnezone and Magnezone ex at one each). A one-of from an unrelated line, such as a tech Castform, never earns a place in the name.

Cards that a stronger card in the same deck evolves from are treated as support. A Magnezone deck is named after Magnezone, not the Magneton feeding it.

Card names use the name, set and number only, without a count. Use `PA` or `PB` for promo sets, not `P-A` or `P-B`.

## Handling shared printings

Some decks use alternate arts or different printings of the same card. You can group these using an array for the primary or secondary slot. 
```TypeScript
const CHARIZARD = [
"Mega Charizard X ex B2b 9",
"Charizard ex A2b 10"
];
```

The matcher treats these aliases interchangeably and accumulates copies across the array entries to meet the copy requirements.  

## Preparing for a new expansion

`EXPANSION_RELEASE_DATE` in `settings.ts` is derived, not hand-edited. It reads the newest dated expansion from the `pokemon-tcg-pocket-cards` package, skipping reprint sets and promo sets with no date. Bumping the package version is what moves the window.

Two things ride on that date. It filters out decks played before the set launched, and it resets the recency weighting, so the tier list reflects the new format only.

If a new set lands and the date does not move, the package has not published it yet. Check the package rather than editing the constant.

## Troubleshooting missing decks

If a popular deck is missing from the frontend after an update, check two things.    
First, verify the deck lists match your defined archetype strings.
Second, check the `MIN_ARCHETYPE_QUALIFIED_GAMES` constant in `settings.ts`. If the deck has fewer than `25` qualified games in the Limitless dataset, the pipeline drops it for having too small of a sample size. 