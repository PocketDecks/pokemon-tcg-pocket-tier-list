# Analysis pipeline reference

The `analysis` module is the data backend for the Pokémon TCG Pocket tier list. It downloads tournament results and uses that data to score the current meta.

## Core data flow

The pipeline downloads data from the Limitless API and assigns standardised names to the deck lists. The scoring scripts then calculate the tier rankings and write JSON files to the public directory for the frontend application.

## Data acquisition

The `download-decks.ts` script fetches data. It pulls tournament standings and pairings for events not present in `processed-tournaments.json`. The `get-tournament-decks.ts` script converts the raw Limitless API responses into `Deck` objects. It tracks wins and losses against specific opponents by matching player IDs.

## The deck store

Decks live in `analysis/data/decks/`, one NDJSON file per expansion set, with `manifest.json` recording each shard's file, deck count and date range. `analysis/src/utils/expansion-shards.ts` routes a deck to the shard of the newest set released on or before its date. `DECKS_DIR` overrides the directory and `ANALYSIS_DATA_DIR` overrides the whole data directory (`analysis/src/utils/data-paths.ts`). `analysis/src/utils/deck-store.ts` is the reader, and `get-decks.ts` reads back only the shards whose date range reaches `EXPANSION_RELEASE_DATE`, so a run does not parse the whole store.

The downloader commits a batch at a time: it writes the decks it fetched and the tournaments it processed together, so a run that throws rolls the batch back and leaves a consistent store, and a rerun resumes from the batches already committed. A hard kill is different: the write renames each target to `.bak` and then its `.tmp` into place, one file at a time, so a kill between two renames can leave the shard and manifest on the new batch while `processed-tournaments.json` still holds the old list. A rerun then refuses the decks it has already written. A `.tmp` beside a target means the save did not finish, so delete every target that has a `.created` marker beside it together with that marker, move the `.bak` files back over their targets, and delete the `.tmp` files; with no `.tmp` left the save finished, so delete the `.bak` files and every `.created` marker and keep the new ones. If the download still refuses with `Deck ... already exists in shard` or `Shard ... exists at ... but the manifest has no entry for it`, delete `analysis/data/decks/` and `analysis/data/processed-tournaments.json` together and rerun the download, which rebuilds both from the API.

`yarn store:migrate` converts a legacy single-file `data/decks.json` into the shards, refusing a store that already holds decks. `yarn store:verify` reads the manifest and every shard it names, and reports a manifest count that disagrees with the file, a missing shard file, a manifest date range that disagrees with the shard's contents, a deck id in two shards, a deck filed in the wrong shard for its date, an untracked `.ndjson` file, and a stray `.tmp` or `.bak` file. It exits 1 when the store directory is absent or holds no shards, unless `--allow-empty` is passed.

## Deck naming

The `get-deck-name.ts` module assigns names to raw card lists. It reads the per-set listing store in `analysis/src/data/limitless-decks.json`, which `analysis/scripts/sync-pairings.ts` scrapes from Limitless. That file is the only source of archetype names.

Each set holds one snapshot of its own deck page. The matcher resolves a row's slug to cards, keeps rows whose every listed card the deck holds, and ranks them by row length first, then by line anchoring, set age and Limitless count.

## Statistical scoring

The maths prevents decks with tiny sample sizes from receiving artificially high scores.

The `calculate-card-scores.ts` file uses a Wilson-style shrinkage estimator. This lower bound is calculated as:

$$\frac{\hat{p} + \frac{z^2}{2n} - z \sqrt{\frac{\hat{p}(1-\hat{p})}{n} + \frac{z^2}{4n^2}}}{1 + \frac{z^2}{n}}$$

where $\hat{p}$ is the observed proportion, $n$ is the sample size, and $z \approx 1.96$.

This bound applies to both win rate and popularity. Card scores are a weighted combination of these two metrics. Deck scores, calculated in `calculate-deck-score.ts`, aggregate the scores of the 20 cards in the list and blend them with the deck's overall meta popularity. Card Score is published for information only and does not affect ranking.

## Power Score

Tiering uses Power Score, not the card composite. `build-deck-power.ts` smooths every matchup win rate toward 50% by its own sample size, weights each by that opponent's share of the window's qualified field, and rescales so the best deck reads 100 and an even win rate reads exactly 50.

`build-matchup-populations.ts` tallies matchups twice per window: the public `matchup-data-{w}.json` keeps every player's games in that window, and the second tally, built from the window's qualified decks only, feeds Power Score. `meta-share-{w}.json` also counts the window's qualified games, so the weights and the win rates Power Score consumes describe one population.

Frequency Score measures play rate against the most-played deck, and Meta Score is the average of the two. Decks whose matchup data covers less than `MIN_FIELD_COVERAGE` of the qualified field are Unranked and shown in their own group rather than given an invented score.

`yarn power:report` prints the live ranking for diagnosis.

## Configuration variables

The `settings.ts` file holds the pipeline constants.

The `MIN_WINRATE_THRESHOLD` is `0.6`. A player must win at least 60 percent of their games in a tournament for their deck to enter the scoring pool.

The `MIN_ARCHETYPE_QUALIFIED_GAMES` is `25`. An archetype needs 25 games in that qualified pool before it can appear in the rankings. This filters out lucky one-off tournament runs.

The Power Score tunables are `MATCHUP_PRIOR_GAMES` at `30` and `MIN_MATCHUP_GAMES` at `2`, both measured in raw game counts, plus `MIN_FIELD_COVERAGE` at `0.25`. The two game-count thresholds are calibrated against the qualified tally, because a qualified row holds on average fewer games than its all-player counterpart. The `settings.ts` comments record the measured ranked counts behind each value.
