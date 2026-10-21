# Local analysis refresh job

This is the self-contained prompt used by the scheduled local tier-list refresh. The job runs on the maintainer's analysis machine and publishes only reviewed generated outputs.

## Schedule

Run on Sunday, Tuesday, Thursday, and Saturday at 21:00 UTC.

## Prompt

Run the Pokemon Pocket tier-list refresh and publish a review branch only when the result passes every check.

Repository: the checked-out `pokemon-tcg-pocket-tier-list` repository.

1. Fetch the current `main` branch and update the local checkout. If the worktree has changes before the run, stop and report the affected paths. Never reset or overwrite user changes.
2. Create a dated branch named `automated/pipeline-update-YYYY-MM-DD` from the current `main` branch. Reuse the dated branch only when it contains no human commits.
3. From `analysis/`, run `yarn.cmd sync-pairings`. This refreshes the tracked Limitless listing store. Promo packs without Limitless deck pages are intentionally excluded.
4. From `analysis/`, run `yarn.cmd golden:generate` so the deck-name golden matches the listing store.
5. Restore interrupted writes before starting a new one. A run interrupted during a write leaves `.tmp`, `.bak` and `.created` files beside its targets, and the next write refuses to start with `Refusing stale staging files for <target>`. An empty `.created` marker beside a target records that the target did not exist before the write, so a recovery deletes it rather than restoring it. A `.tmp` beside a target means the save did not finish, so delete every target that has a `.created` marker beside it together with that marker, move every `.bak` back over its target, and delete every `.tmp`. With no `.tmp` left the save finished, so delete every `.bak` and every `.created` marker and keep the new files. Do this for the public data files, the deck store in `analysis/data/decks/`, `analysis/data/processed-tournaments.json`, the pairing store in `analysis/src/data/limitless-decks.json` and `analysis/src/app/last-updated.ts`. The OG image swap stages into a directory beside `public/og/deck` and publishes by renaming the live directory to `deck.previous` and then the staging directory into place. A run killed between those two renames leaves `deck` missing with `deck.previous` holding the old set, and one killed during rendering leaves an orphan `deck-stage-*` directory; `stageOgImages` refuses to publish while `deck.previous` exists. When `deck` is missing and `deck.previous` exists, move `deck.previous` back to `deck`; delete any `deck.previous` that remains and every `deck-stage-*` directory beside it, then run `yarn.cmd store:verify` from `analysis/` and continue only when it exits 0. If the download still refuses with `Deck ... already exists in shard` or `Shard ... exists at ... but the manifest has no entry for it`, delete `analysis/data/decks/` and `analysis/data/processed-tournaments.json` together and rerun the download, which rebuilds both from the API.
6. From `analysis/`, run `yarn.cmd download`. The downloader commits the deck store a batch at a time, so a run that fails with a thrown error keeps the batches that finished: every deck in the store belongs to a tournament in `processed-tournaments.json`, and every tournament listed there has been processed, whether or not it produced usable decks. A rerun resumes from those batches and does not duplicate a deck. A killed run can leave the shard and manifest on the new batch while `processed-tournaments.json` still holds the old one, and the rerun then refuses with `Deck ... already exists in shard`, so it never duplicates a deck. Apply the recovery in step 5 and run `yarn.cmd store:verify` before rerunning. Partial output is not a reason to stop, because the store is the resume point. Stop only when the command exits non-zero, and report the exact error.
7. From `analysis/`, run `yarn.cmd card-printings:generate` so a card name shared by several cards in one set resolves to the printing the decks play, then run `yarn.cmd start` to regenerate the public data, deck images, and update timestamp. The command refuses to publish when a gate fails, prints every failure it found in one message, and exits 1. Report the refusal as it stands and leave the judgement to the code. `assertPublishable` in `analysis/src/utils/assert-publishable.ts` owns the floors, so this prompt carries none of them. Then run `yarn.cmd validate:refresh`, which compares each window against the previous `origin/main` snapshot and requires an OG image for every name in the union, and stop on a non-zero exit.
8. Run `yarn.cmd test` and `yarn.cmd typecheck` from `analysis/`. From the repository root, run `yarn.cmd typecheck`, `yarn.cmd lint`, and `yarn.cmd test:ci`. Stop at the first failure and report the command and first error.
9. Inspect `git status --short`. Never stage `analysis/data/`; the raw tournament store stays local. If no tracked pairing, golden, or public-output files changed, report a silent day and stop.
10. Commit only the refreshed pairing store, naming golden, canonical printings, public data, public deck images, and update timestamp. Use `chore(data): refresh tier-list snapshot` as the commit subject.
11. Push the dated branch to the repository's review remote and create or update one pull request against `main`. Use the title `chore(data): refresh tier-list snapshot`. The body must state the pairing-row count, ranked-archetype count, image parity, and test results. Check the title and body for EN-UK spelling and ensure the gate is applied before posting.
12. Read the pull request back after publishing. Verify that its head SHA equals the local commit and report the review URL plus the current check states. Never merge and never push `main`.

## Freshness

Windows anchor on the newest data date, so stale raw data still fills every window and ranks archetypes normally. The run clock reaches further than `generatedAt`: it sets the score weights in `scoringWeights(today)`, drops the run day from the trend series, and writes `LAST_UPDATED`. `assertPublishable` also compares the newest qualified deck's date against that same clock and refuses a run past `MAX_DATA_AGE_DAYS`, so the freshness guard lives in code and needs no measurement here.

## Failure rules

- Do not publish raw tournament data.
- Do not treat a failed download as a finished one. The store holds the batches that completed, so rerun `yarn.cmd download` and let it finish. A killed run needs the recovery in step 5 and `yarn.cmd store:verify` before rerunning.
- A download that finds the store lock held by a live process stops and reports the holding pid. A later run reclaims a lock whose owner has gone, so nothing needs deleting by hand.
- Do not override a refusal from `yarn.cmd start`. Report the failures it prints.
- Do not open a second review for the same dated branch.
- A run with no tracked output changes is silent.
