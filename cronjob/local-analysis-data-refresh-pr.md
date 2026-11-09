# Local analysis refresh job

This is the self-contained prompt used by the scheduled local tier-list refresh. The job runs on the maintainer's analysis machine and publishes only reviewed generated outputs.

## Schedule

Run on Sunday, Tuesday, Thursday, and Saturday at 21:00 UTC.

## Prerequisite

This job publishes premium data to Firestore, so the analysis machine needs Application Default Credentials for the project before step 10 runs. The publisher identifies the canonical Git remote by its GitHub repository URL (`PocketDecks/pokemon-tcg-pocket-tier-list`) and uses that remote's `main` as the comparison baseline. Its local alias can vary between checkouts.

If the publish or verify step fails, report the exact refusal and stop. The published version document is written last, so readers never see a half-written version. Publishing before the merge is safe: cleanup keeps the newest five versions and protects the versions referenced by canonical `main`, the deployed version document on the site, and every open pull request targeting canonical `main`, including pull requests from forks. If any retention source cannot be read, publishing may proceed but deletes nothing, and the refusal names the source that could not be read.

The premium publication lock uses a Firestore transaction before listing existing versions. A competing run refuses and must stop with the lock details. A crash leaves the lock in place without automatic expiry. Before a person removes it, they must confirm the lock owner at the recorded host and process ID is gone; otherwise stop and report the lock.

## Prompt

Run the Pokemon Pocket tier-list refresh and publish a review branch only when the result passes every check.

Repository: the checked-out `pokemon-tcg-pocket-tier-list` repository.

1. From `analysis/`, run `yarn.cmd refresh:outputs recover`. It restores checkpointed generated files and repairs recognised atomic-write sidecars only when their backups or owner proofs match the recorded baseline. It does not recover `analysis/data/`. If recovery reports an error, leaves `public/og/deck-stage-*` or `public/og/deck.previous`, or any generated output is still dirty, stop and report the exact paths. Untracked `.claude/` and `.codex/` tool directories do not stop recovery; every other untracked file and any change to a tracked file does. Then fetch and update `main` from the remote whose GitHub URL resolves to the canonical repository above; the remote alias can vary between checkouts. Stop if either command fails.
2. Create a dated branch named `automated/pipeline-update-YYYY-MM-DD` from the current `main` branch. Reuse the dated branch only when it contains no human commits. Stop if branch creation or checkout fails.
3. From `analysis/`, run `yarn.cmd refresh:outputs begin`. Stop if it fails. Then run `yarn.cmd sync-pairings`. Run `yarn.cmd refresh:outputs checkpoint` even on failure, then stop on a non-zero exit.
4. From `analysis/`, run `yarn.cmd golden:generate`, checkpoint its outputs even on failure, then stop on a non-zero exit.
5. Run `yarn.cmd store:verify` from `analysis/` and continue only when it exits 0. Recovery ran before fetch and the worktree check in step 1. If verification fails, stop. Before any human repair, copy the full `analysis/data/` directory, including `decks/`, `processed-tournaments.json` and any sidecars, to `analysis/data-backup/YYYY-MM-DD/`, then ask a person to review it. Never delete or restore raw-store files automatically.
6. From `analysis/`, run `yarn.cmd download`. The downloader commits the deck store a batch at a time, so a run that fails with a thrown error keeps the batches that finished: every deck in the store belongs to a tournament in `processed-tournaments.json`, and every tournament listed there has been processed, whether or not it produced usable decks. A rerun resumes from those batches and does not duplicate a deck. A killed run can leave the shard and manifest on the new batch while `processed-tournaments.json` still holds the old one, and the rerun then refuses with `Deck ... already exists in shard`, so it never duplicates a deck. Do not rerun inside the same run after recovery: recovery removes the refresh journal, so the first checkpoint of a rerun would fail. Start the next run again at step 1, create the journal with `yarn.cmd refresh:outputs begin` in step 3, and run `yarn.cmd store:verify` before `yarn.cmd download`. Partial output is not a reason to stop, because the store is the resume point. Stop on any non-zero exit and report the exact error.
7. From `analysis/`, run `yarn.cmd card-printings:generate`, then run `yarn.cmd start`. It runs `assertPublishable` before writing JSON. It commits JSON atomically, then commits OG images separately; the image commit can fail after JSON publication, in which case the rendered staging directory is kept and the refusal names its exact path. Checkpoint after each mutation even on non-zero exit, then stop on failure. From the repository root, run `node scripts/build-deck-archive.mjs`, `node scripts/generate-deck-hub-slugs.mjs`, then `node scripts/generate-deck-redirects.mjs`, checkpointing each command and stopping on its failure. From `analysis/`, run `yarn.cmd validate:refresh` (the script exists only in `analysis/package.json`) and stop on failure.
8. Run `yarn.cmd test` and `yarn.cmd typecheck` from `analysis/`. From the repository root, run `yarn.cmd typecheck`, `yarn.cmd lint`, `yarn.cmd test:ci`, and `yarn.cmd check:generated`. Stop at the first failure and report the command and first error.
9. Inspect `git status --short` and run `yarn.cmd refresh:outputs classify`. If the classifier prints no paths, run `yarn.cmd refresh:outputs recover`, report a silent day and stop. The classifier excludes `src/app/last-updated.ts` and includes ignored premium outputs; generated hub files count as output. Never stage `analysis/data/`. Stop on any non-zero exit and report the exact error.
10. From `analysis/`, run `yarn.cmd publish:premium --dry-run`, then `yarn.cmd publish:premium`, then `yarn.cmd verify:premium`. Stop on any non-zero exit and report the refusal.
11. Run `yarn.cmd refresh:outputs stage` from `analysis/`, then commit the staged outputs with `chore(data): refresh tier-list snapshot`. After a successful commit, run `yarn.cmd refresh:outputs finish`. Stop on any non-zero exit and report the command and first error; do not push a partial commit.
12. Push the dated branch to the repository's review remote and create or update one pull request against `main`. Use the title `chore(data): refresh tier-list snapshot`. The body must state the pairing-row count, ranked-archetype count, image parity, test results, and the published premium version (matching `public/data/data-version.json`). Check the title and body for EN-UK spelling and ensure the gate is applied before posting. Stop on any non-zero exit and report the command and first error. If the push succeeds but the pull request cannot be created, report the pushed branch and stop without republishing; the next run reuses that dated branch.
13. Read the pull request back after publishing. Verify that its head SHA equals the local commit and report the review URL plus the current check states. Never merge and never push `main`.

## Freshness

Windows anchor on the newest data date, so stale raw data still fills each window and ranks archetypes. Score weights use that same data anchor. The trend series includes every calendar day with qualified games, so a day's decks appear in the run that first sees them and a run with no new data stays silent. The run clock still sets `LAST_UPDATED`. `assertPublishable` compares the newest qualified deck date with the run clock and refuses data older than `MAX_DATA_AGE_DAYS`; this freshness guard is implemented in code.

## Failure rules

- Do not publish raw tournament data.
- Do not treat a failed download as a finished one. The store holds the batches that completed, so rerun `yarn.cmd download` and let it finish. A killed run needs the recovery in step 1, which removes the refresh journal, so start a new run at step 1, create a fresh journal with `yarn.cmd refresh:outputs begin` in step 3, and run `yarn.cmd store:verify` before `yarn.cmd download`; never rerun after recovery inside the same run.
- A download refused by the store lock may be retried once, after a few seconds, if the refusal says to retry. Any other refusal is stopped and reported, naming the holding pid, the claim file, or the lock file. A later run reclaims a lock or claim whose owner has gone. The exception is a claim or lock whose pid has been reused by an unrelated process: it still looks held and needs deleting by hand, which this job must not do, so stop and report it.
- Do not override a refusal from `yarn.cmd start`. Report the failures it prints.
- Do not open a second review for the same dated branch.
- A run is silent only when `yarn.cmd refresh:outputs classify` prints no paths. The classifier excludes `src/app/last-updated.ts` and counts ignored premium outputs.
