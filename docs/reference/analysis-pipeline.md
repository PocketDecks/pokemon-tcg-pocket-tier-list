# Analysis pipeline reference

The `analysis` module is the data backend for the Pokémon TCG Pocket tier list. It downloads tournament results and uses that data to score the current meta.

## Core data flow

The pipeline downloads data from the Limitless API and assigns standardised names to the deck lists. The scoring scripts then calculate the tier rankings and write JSON files to the public directory for the frontend application.

## Data acquisition

The `download-decks.ts` script fetches data. It pulls tournament standings and pairings for events not present in `processed-tournaments.json`. The `get-tournament-decks.ts` script converts the raw Limitless API responses into `Deck` objects. It tracks wins and losses against specific opponents by matching player IDs.

A tournament counts only when its listing and its details describe standard play. The listing `format` must be absent, `null` or `STANDARD`, so `CUSTOM`, `NOEX` and any format Limitless adds later are dropped in the listing filter, at no request cost. The details decide the rest: `specialRules` must be absent or empty, no `bannedCards` entry may ban a whole set (`"name": "*"`), and the list may name at most `MAX_BANNED_CARDS` cards, which is `2`. The downloader reads a tournament's details before its standings and pairings, logs `Tournament <id>: skipped, <reason>` when the details fail any of these, and records the tournament as processed, so it is not fetched again. A `bannedCards` or `specialRules` field that is present but not an array throws a `LimitlessError` naming the tournament.

## The deck store

Decks live in `analysis/data/decks/`, one NDJSON file per expansion set, with `manifest.json` recording each shard's file, deck count and date range. `analysis/src/utils/expansion-shards.ts` routes a deck to the shard of the newest set released on or before its date. `DECKS_DIR` overrides the directory and `ANALYSIS_DATA_DIR` overrides the whole data directory (`analysis/src/utils/data-paths.ts`). `analysis/src/utils/deck-store.ts` is the reader, and `get-decks.ts` reads back only the shards whose date range reaches `EXPANSION_RELEASE_DATE`, so a run does not parse the whole store.

The downloader commits a batch at a time: it writes the decks it fetched and the tournaments it processed together, so a run that throws rolls the batch back and leaves a consistent store, and a rerun resumes from the batches already committed. A hard kill is different: the write renames each target to `.bak` and then its `.tmp` into place, one file at a time, so a kill between two renames can leave the shard and manifest on the new batch while `processed-tournaments.json` still holds the old list. A rerun then refuses the decks it has already written. A `.tmp` beside a target means the save did not finish, so delete every target that has a `.created` marker beside it together with that marker, move the `.bak` files back over their targets, and delete the `.tmp` files; with no `.tmp` left the save finished, so delete the `.bak` files and every `.created` marker and keep the new ones. If the download still refuses with `Deck ... already exists in shard` or `Shard ... exists at ... but the manifest has no entry for it`, delete `analysis/data/decks/` and `analysis/data/processed-tournaments.json` together and rerun the download, which rebuilds both from the API.

`yarn store:migrate` converts a legacy single-file `data/decks.json` into the shards, refusing a store that already holds decks. `yarn store:verify` reads the manifest and every shard it names, and reports a manifest count that disagrees with the file, a missing shard file, a manifest date range that disagrees with the shard's contents, a deck id in two shards, a deck filed in the wrong shard for its date, an untracked `.ndjson` file, and a stray `.tmp`, `.bak` or `.created` file. An empty `.created` marker beside a target records that the target did not exist before the write, so a recovery deletes it rather than restoring it. It exits 1 when the store directory is absent or holds no shards, unless `--allow-empty` is passed.

`yarn store:purge-formats` removes the non-standard tournaments already in the store. The downloader now skips them at download time, so a rerun never clears them. It reads the decks in every shard that the pipeline's read cut-off reaches, groups them by tournament id, fetches one listing bounded to `LISTING_LIMIT` (`10,000`) rows for all tournaments, then one details request per tournament the listing omits or accepts, and applies the same format rule. By default it is a dry run: it prints one line per tournament it would remove, with id, date, name, reason and deck count, plus a total, and writes nothing. `--apply` rewrites each affected shard without those decks, updates that shard's manifest `count`, `minDate` and `maxDate` from the remaining decks, and commits through `writeArtefacts`, so an interrupted write recovers the documented way. It leaves `processed-tournaments.json` untouched, so a removed tournament is not downloaded again, and it refuses before writing anything if a shard would end up empty. `--dir` points it at another store location. The purge takes the store lock described in the [Store lock](#store-lock) section.

## Store lock

### Location

- The purge and a download batch take the same store lock, so the two cannot interleave.
- The lock file is `analysis/data/decks.lock`, beside the store directory.
- `DECKS_DIR` and `ANALYSIS_DATA_DIR` move the lock and its claims directory with the store, because the lock is always the store directory's path with `.lock` added: `DECKS_DIR=/x/decks` puts it at `/x/decks.lock`, and `ANALYSIS_DATA_DIR=/y` without `DECKS_DIR` puts it at `/y/decks.lock`.
- The purge's `--dir` option moves it the same way.

### Claims

- Before it takes the lock, a run writes a claim file into the `analysis/data/decks.lock.claims/` directory, named `<pid>-<uuid>` and holding its pid.
- A claim whose pid is running blocks other runs; a claim whose pid has gone is removed by the next run; a claim with no pid in its name or contents blocks for five seconds after its last write, then is removed.
- Two runs that start together can each see the other's claim and both refuse.
- A claim that names this process's own pid and that this process created and has not removed belongs to a store lock call still running in the same process: a nested call is refused, the refusal says so, and the claim clears when the outer call ends.

### Stale-lock reclaim

- A stale lock is reclaimed once the run re-reads it and finds the same stale contents it inspected: the run moves the lock aside to a `decks.lock.<pid>.<uuid>.reclaim` file beside it, reads that file, and removes it if it still holds those stale contents.
- If the lock has changed when the run re-reads it, the run refuses only when the new contents name a running pid other than this process's, or name no pid and the lock is younger than five seconds; otherwise it tries again.
- If the moved file holds different contents, the run restores it with a hard link, which never overwrites, and then judges the restored lock as above: a live holder is refused on its pid, and a stale one is tried again.
- If another writer has taken the lock name by then, the restore fails and the run refuses, naming both that holder and the moved file, and leaves the moved file in place.

### Leftover files and manual clean-up

- A run that stops after the move and before the restore leaves the lock name free and its `.reclaim` file holding the displaced lock.
- A run that stops after the restore and before it removes the moved file leaves a `.reclaim` copy beside a lock that is still in place.
- Later runs never read `.reclaim` files, so delete one by hand only after confirming that no download or purge is running and that the pid in it is not a live holder that still needs the lock.
- A claim this process failed to remove is no longer recorded in memory, so its own next call reclaims it with a warning.
- A claim that names this process's pid but that this process did not create is left by an earlier process with the same pid; the run that finds it removes it with a warning.
- A lock that names this process's pid while no claim of this process is live is left by a release this process could not finish or by an earlier process with the same pid; the next call in this process reclaims it with a warning.
- If that pid now belongs to an unrelated process, the claim or lock is stale and will not clear on its own, so delete it by hand only after confirming that no download or purge is running.

### Refusals

- A refusal that names a pid means that pid is running, or that the probe for it failed with something other than "no such process", so the run could not show it had gone.
- For a claim naming a pid, the refusal says another run is starting, so retry shortly, only when that claim is younger than five seconds and no lock file exists yet; a claim with no pid always says so.
- The refusal for a young claim with no pid, and the refusal that the lock kept changing during acquisition, name no process; both are transient, so wait a few seconds, retry the run and delete nothing.

### Constraints

- All writers to one store must run this version: a pre-claim build sharing the store is unsupported, because its lock writes can race a reclaim.
- Run one store writer per process: withStoreLock refuses to run off the main thread, because worker threads share this process's pid but not its in-process record of claims, so a worker that took the lock could reclaim a claim the main thread holds.
- The refusal stops a worker from entering while another thread holds the store.
- A store lock callback must be synchronous: a callback that returns a promise makes the call throw a TypeError, because the callback's work continues after the lock is released.

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

`yarn power:report` prints the ranking the site publishes, read from `public/data/best-decks.json` and `meta-share.json`, and names the snapshot it read. It recomputes nothing, so a change to the scoring inputs appears only after the pipeline regenerates those files.

## Configuration variables

The `settings.ts` file holds the pipeline constants.

The `MIN_WINRATE_THRESHOLD` is `0.6`. A player must win at least 60 percent of their games in a tournament for their deck to enter the scoring pool.

The `MIN_ARCHETYPE_QUALIFIED_GAMES` is `25`. An archetype needs 25 games in that qualified pool before it can appear in the rankings. This filters out lucky one-off tournament runs.

The Power Score tunables are `MATCHUP_PRIOR_GAMES` at `30` and `MIN_MATCHUP_GAMES` at `2`, both measured in raw game counts, plus `MIN_FIELD_COVERAGE` at `0.25`. The two game-count thresholds are calibrated against the qualified tally, because a qualified row holds on average fewer games than its all-player counterpart. The `settings.ts` comments record the measured ranked counts behind each value.
