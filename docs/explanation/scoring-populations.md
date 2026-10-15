# Explanation: scoring populations and what each number counts

The tier list publishes several figures per deck, and they are not all measured on the same games. Two numbers for the same deck can differ by several points, so this page names the population behind each one.

## The qualified pool

The pipeline windows the deck store, then keeps a deck record only when the pilot who played it won at least 60% of their games in that tournament (`MIN_WINRATE_THRESHOLD` in `analysis/src/settings.ts`). The pipeline applies the filter per player per tournament. An archetype is ranked once it holds at least 25 qualified games.

That gate keeps unoptimised lists and weak piloting out of the ranking. It also means the qualified pool holds winning runs, so its win rates sit well above the rates across every game.

## The ranking order

`analysis/src/utils/build-window-artefacts.ts` scores each archetype and sorts the published file by the result. The score blends card strength with popularity:

    score = cardStrength * winrateImportance + popularity * popularityImportance

`cardStrength` is the count-weighted average of the deck's cards' shrunk scores over the qualified games of the decks holding them. `popularity` is the archetype's share of the window's qualified games. `scoringWeights` sets the blend from the format's age: the win-rate weight starts at 0.2 on the expansion release date, rises 0.15 a week, and stops at 0.75.

## The published columns

| Column | Population | What it holds |
|---|---|---|
| `score` | qualified | the sort key described above |
| `expectedWinRate` | qualified | the deck's win rate over the field, weighted by how often each opponent appears |
| `powerScore` | qualified | `expectedWinRate` rescaled so the best ranked deck reads 100 and an even rate reads 50 |
| `freqScore` | qualified | play rate against the most-played deck |
| `metaScore` | qualified | the average of Power Score and Frequency |
| `matchup-data.json` rows | every player | each opponent's win rate and game count |

`expectedWinRate` shrinks every matchup row toward 50% by a 30-game prior (`MATCHUP_PRIOR_GAMES`), weights each row by the opponent's share of the qualified field, and divides by the share of the field the rows cover. Decks covering under a quarter of the field are left unranked.

## Why the two disagree

The matchup rows count every player, including casual lists and short runs, while the ranking reads the qualified pool. A deck can therefore show a win rate near even on its page and rank near the top of the list. The gap follows from the gate itself, and it is also why the top of the list is usually tight: the gate lifts every archetype the same way, which compresses the differences between them.

## Reading the deck page

The Win Rate in the page header and the matchup lists come from the matchup rows, so they count every player in the window. Power Score and Expected Win Rate in the Key Stats come from the qualified pool, which is the population the ranking scores.

## Reproducing the numbers

One pipeline run produces both tallies. `yarn start` in `analysis/` rebuilds the published files from the deck store, and the analysis tests cover the scoring helpers in `build-deck-power.ts` and `calculate-deck-score.ts`.
