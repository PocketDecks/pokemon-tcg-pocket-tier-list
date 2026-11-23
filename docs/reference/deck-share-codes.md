# Deck share codes reference

How the QR code and raw deck code on deck pages are built, and how to keep
the fixtures honest when the card data moves on.

## Binary format

Layout before base64. Ground truth: byte-decoded game-generated QR codes,
cross-checked byte-for-byte against every current deck list.

```text
[trainer segment][pokémon segment][energy block]

Trainer segment:  1 byte count N, then N × 3-byte big-endian values of (nr × 10)
Pokémon segment:  1 byte count N, then N × 3-byte big-endian values of (nr × 10)
Energy block:     1 byte count, then one byte per energy id.
                  Present whenever the pokémon segment is non-empty,
                  even with zero energies.
Whole byte array: base64, standard padding.
```

Constants:

- `TRAINER_OFFSET = 1_000_000`: trainer `deckBuilderNr`s live above this.
- `SPECIAL_THRESHOLD = 100_000`: values ≥ this go in the trainer segment.
- Energy ids: Grass 1, Fire 2, Water 3, Lightning 4, Psychic 5, Fighting 6,
  Darkness 7, Metal 8.

Behaviour locked in by the golden fixtures:

- Both segments store `(nr × 10)` as big-endian three-byte values.
- Repeated numbers stay as separate entries; zeros are stored like any other
  number.
- Each segment is sorted ascending. Energy ids must also be ascending: a
  live scan accepted `[2, 4]` and rejected `[4, 2]` for the same deck
  (2026-08-22).
- An empty input list returns `null`.

## Energy inference

Baseline rule: count energy letters across the attack costs of all Pokémon in
the list (each copy counts), rank by count descending then alphabetical, take
the top three. Colourless (`C`) is not an energy id. If no candidate survives
the exclusions below, re-run including them. If still nothing, encode with an
empty energy segment and show the helper note.

Outlier cards, keyed by `deckBuilderNr` so every print sharing the number
behaves identically:

| Numbers | Rule |
| --- | --- |
| 89 (Greninja), 1383 (Ogerpon ex), 1203 (Indeedee ex), 552 (Giratina ex) | Never imply their own element |
| 647 (Lightning Oricorio) | Always force Lightning, counted like +1 |

Known refinement deliberately out of scope: ignoring pre-evolution costs when
the evolution is in the same list (e.g. Goomy's `WP` alongside Hisuian
Goodra).

## Fixture regeneration

When the `pokemon-tcg-pocket-cards` dependency moves to a new payload version:

1. Refresh `src/app/__fixtures__/cards-full-v510.json`:

   ```sh
   curl -sL "https://raw.githubusercontent.com/chase-mew/pokemon-tcg-pocket-cards/refs/tags/v<VERSION>/data/v5/cards.min.json" \
     -o src/app/__fixtures__/cards-full-v510.json
   ```

2. Update the three records in `src/app/__fixtures__/cards.json`
   (`a1-001`, `a1-219`, `a1-004`) with their new `deckBuilderNr` values.
3. Re-derive `src/app/__fixtures__/deck-codes.json`: for each best list in
   `public/data/best-decks.json`, resolve the card ids to `deckBuilderNr`s
   via the new payload, run energy inference plus the encoder from
   `src/app/deck-code.ts`, and write
   `{ "<deck-slug>": [nrs, energyIds, expectedBase64] }`. Work deck by deck
   against real output rather than scripting the whole loop blind.
4. Run the golden suite. Any mismatch means the encoder deviated: fix the
   encoder, never edit the fixture to make it pass.

## Manual scan log

| Date | Deck slug | Result |
| --- | --- | --- |
