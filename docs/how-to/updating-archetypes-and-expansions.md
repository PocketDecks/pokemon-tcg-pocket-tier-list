# How-to guide: Updating archetypes and expansions

The meta shifts when players discover new decks or new cards are released. You maintain the tier list by refreshing the per-set listing store and, when a set drops, confirming the release date the package reports.

## Where archetype names come from

Deck names come from `analysis/src/data/limitless-decks.json`, which `analysis/scripts/sync-pairings.ts` scrapes from Limitless. `get-deck-name.ts` reads that file as its only source. There is no hand-maintained archetype list.

The store holds one snapshot per set: the name, slug and count exactly as that set's Limitless deck page shows them. Refetching a set replaces its array wholesale, so nothing accumulates across runs and no pairing graph is inferred.

To pick up new listings, run the scraper from `analysis/`:

```
yarn sync-pairings
```

Only sets with a Limitless deck page are scraped, A1 through B4a. `PA` and `PB` are promo packs with no deck page, and `A4b` was folded into `A4a`, so none of the three is fetched. A set page that comes back identical to another set's page is rejected rather than written, since two sets never share a page.

A few archetypes never appear on Limitless. Those are seeded in `SEEDED_ARCHETYPES` in the matcher so a rebuild does not lose them. Add to that list if a real deck has no listing anywhere on the site.

## How a name is chosen

The matcher resolves each listing row's slug to cards, keeps only rows whose every listed card the deck actually holds, then ranks the survivors.

Row length decides first, so a two-card listing beats a one-card listing. Two signals separate rows of equal length: whether the row's cards share a species or evolution line, and whether a row card tops a line the deck plays while no row member is a plain tech Basic. That last one is what keeps a 2-of Igglybuff or Mantyke from naming a deck whose centrepiece is something else. Newer set and higher Limitless count follow as tiebreaks.

Cards that a stronger card in the same deck evolves from are treated as support, so a Magnezone deck is named after Magnezone, not the Magneton feeding it.

Card names use the name, set and number only, without a count. Use `PA` or `PB` for promo sets, not `P-A` or `P-B`.

## Handling shared printings

A card with several printings gets one key per printing, not an alias group. `Charizard ex A1 36` and `Charizard ex A2b 10` are separate keys, each carrying the partners it was actually seen with.

Copies are not pooled across printings. A deck running one copy of each printing holds one of each.

When a row could resolve to more than one printing, the one in the set the slug names wins. If no printing sits in that set, the earliest printing is used, which is what folds a reprint onto the original.

## Preparing for a new expansion

`EXPANSION_RELEASE_DATE` in `settings.ts` is derived, not hand-edited. It reads the newest dated expansion from the `pokemon-tcg-pocket-cards` package, skipping reprint sets and promo sets with no date. Bumping the package version is what moves the window.

Two things ride on that date. It filters out decks played before the set launched, and it resets the recency weighting, so the tier list reflects the new format only.

If a new set lands and the date does not move, the package has not published it yet. Check the package rather than editing the constant. Add the new code to `STANDARD_SET_CODES` in `analysis/src/utils/set-codes.ts` so its page is scraped.

## Troubleshooting missing decks

If a popular deck is missing from the frontend after an update, check two things.

First, verify the deck lists match your defined archetype strings.

Second, check `MIN_ARCHETYPE_QUALIFIED_GAMES` in `settings.ts`. If the deck has fewer than 25 qualified games in the Limitless dataset, the pipeline drops it for having too small of a sample size.
