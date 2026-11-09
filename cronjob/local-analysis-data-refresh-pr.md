# Local analysis refresh job

This is the self-contained prompt used by the scheduled local tier-list refresh. The job runs on the maintainer's analysis machine and publishes only reviewed generated outputs.

## Schedule

Run on Sunday, Tuesday, Thursday, and Saturday at 21:00 UTC.

## Prerequisite

This job publishes premium data to Firestore, so the analysis machine needs Application Default Credentials for the project before step 10 runs. If the publish or the verify step fails, report the exact refusal and stop; the published version document is written last, so readers never see a half-written version. Publishing before the merge is safe: the live site still points at the older version, and the upload keeps the newest five versions and never deletes the one `origin/main` serves. When `origin/main` cannot be read, it deletes nothing

## Prompt

Run the Pokemon Pocket tier-list refresh and publish a review branch only when the result passes every check.

Repository: the checked-out `pokemon-tcg-pocket-tier-list` repository.

1. Fetch the current `main` branch and update the local checkout. If the worktree has changes before the run, stop and report the affected paths. Never reset or overwrite user changes.
2. Create a dated branch named `automated/pipeline-update-YYYY-MM-DD` from the current `main` branch. Reuse the dated branch only when it contains no human commits.
3. From `analysis/`, run `yarn.cmd sync-pairings`. This refreshes the tracked Limitless listing store. Promo packs without Limitless deck pages are intentionally excluded.
4. From `analysis/`, run `yarn.cmd golden:generate` so the deck-name golden matches the listing store.
5. Run `yarn.cmd refresh:outputs recover`, then `yarn.cmd store:verify` from `analysis/`. Continue only when store verification exits 0.
6. From `analysis/`, run `yarn.cmd download`. The downloader commits the deck store a batch at a time, so a run that fails with a thrown error keeps the batches that finished: every deck in the store belongs to a tournament in `processed-tournaments.json`, and every tournament listed there has been processed, whether or not it produced usable decks. A rerun resumes from those batches and does not duplicate a deck. A killed run can leave the shard and manifest on the new batch while `processed-tournaments.json` still holds the old one, and the rerun then refuses with `Deck ... already exists in shard`, so it never duplicates a deck. Apply the recovery in step 5 and run `yarn.cmd store:verify` before rerunning. Partial output is not a reason to stop, because the store is the resume point. Stop only when the command exits non-zero, and report the exact error.
7. From `analysis/`, run `yarn.cmd card-printings:generate` so a card name shared by several cards in one set resolves to the printing the decks play, then run `yarn.cmd start` to regenerate the public data, deck images, and update timestamp. From the repository root, run `node scripts/build-deck-archive.mjs` then `node scripts/generate-deck-hub-slugs.mjs` and `node scripts/generate-deck-redirects.mjs`, so the deck archive, hub slug list and redirects follow any deck that entered or left the meta. The command refuses to publish when a gate fails, prints every failure it found in one message, and exits 1. Report the refusal as it stands and leave the judgement to the code. `assertPublishable` in `analysis/src/utils/assert-publishable.ts` owns the floors, so this prompt carries none of them. Then run `yarn.cmd validate:refresh`, which compares 10d and 20d with the fetched `origin/main` snapshot and 30d and all with `analysis/out/premium-previous/`, and requires an OG image for every name in the union. Stop on a non-zero exit.
8. Run `yarn.cmd test` and `yarn.cmd typecheck` from `analysis/`. From the repository root, run `yarn.cmd typecheck`, `yarn.cmd lint`, `yarn.cmd test:ci`, and `yarn.cmd check:generated`. Stop at the first failure and report the command and first error.
9. Inspect `git status --short` and run `yarn.cmd refresh:outputs classify`. If only `src/app/last-updated.ts` changed, run `yarn.cmd refresh:outputs recover`, report a silent day and stop. Generated hub files count as output. Never stage `analysis/data/`.
10. From `analysis/`, run `yarn.cmd publish:premium --dry-run`, then `yarn.cmd publish:premium`, then `yarn.cmd verify:premium`. Stop on any non-zero exit and report the refusal.
11. Run `yarn.cmd refresh:outputs stage` from `analysis/`, then commit the staged generated outputs with the refreshed pairing store. Use `chore(data): refresh tier-list snapshot` as the commit subject.
12. Push the dated branch to the repository's review remote and create or update one pull request against `main`. Use the title `chore(data): refresh tier-list snapshot`. The body must state the pairing-row count, ranked-archetype count, image parity, test results, and the published premium version (matching `public/data/data-version.json`). Check the title and body for EN-UK spelling and ensure the gate is applied before posting.
13. Read the pull request back after publishing. Verify that its head SHA equals the local commit and report the review URL plus the current check states. Never merge and never push `main`.

## Freshness

Windows anchor on the newest data date, so stale raw data still fills every window and ranks archetypes normally. The run clock reaches further than `generatedAt`: it sets the score weights in `scoringWeights(today)`, drops the run day from the trend series, and writes `LAST_UPDATED`. `assertPublishable` also compares the newest qualified deck's date against that same clock and refuses a run past `MAX_DATA_AGE_DAYS`, so the freshness guard lives in code and needs no measurement here.

## Failure rules

- Do not publish raw tournament data.
- Do not treat a failed download as a finished one. The store holds the batches that completed, so rerun `yarn.cmd download` and let it finish. A killed run needs the recovery in step 5 and `yarn.cmd store:verify` before rerunning.
- A download refused by the store lock may be retried once, after a few seconds, if the refusal says to retry. Any other refusal is stopped and reported, naming the holding pid, the claim file, or the lock file. A later run reclaims a lock or claim whose owner has gone. The exception is a claim or lock whose pid has been reused by an unrelated process: it still looks held and needs deleting by hand, which this job must not do, so stop and report it.
- Do not override a refusal from `yarn.cmd start`. Report the failures it prints.
- Do not open a second review for the same dated branch.
- A run with no tracked output changes is silent.
