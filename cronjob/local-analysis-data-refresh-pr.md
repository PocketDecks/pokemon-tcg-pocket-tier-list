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
5. From `analysis/`, run `yarn.cmd download`. The downloader must leave both raw files unchanged when any tournament fails. Stop on failure and report the exact error.
6. From `analysis/`, run `yarn.cmd start` to regenerate the public data, deck images, and update timestamp.
7. Validate the generated result: parse `public/data/best-decks.json`; require at least 75 ranked archetypes; reject a result below half the previous `main` snapshot count; require one deck image for every JSON deck with no orphan images; require the pairing store to contain the current `B4a` set; treat the `Professor's Research` fallback as valid when it contains unmatched ordinary lists.
8. Run `yarn.cmd test` and `yarn.cmd typecheck` from `analysis/`. From the repository root, run `yarn.cmd typecheck`, `yarn.cmd lint`, and `yarn.cmd test:ci`. Stop at the first failure and report the command and first error.
9. Inspect `git status --short`. Never stage `analysis/data/`; the raw tournament store stays local. If no tracked pairing, golden, or public-output files changed, report a silent day and stop.
10. Commit only the refreshed pairing store, naming golden, public data, public deck images, and update timestamp. Use `chore(data): refresh tier-list snapshot` as the commit subject.
11. Push the dated branch to the repository's review remote and create or update one pull request against `main`. Use the title `chore(data): refresh tier-list snapshot`. The body must state the pairing-row count, ranked-archetype count, image parity, and test results. Check the title and body for EN-UK spelling, straight quotes, no em dashes, and no AI or internal process references before posting.
12. Read the pull request back after publishing. Verify that its head SHA equals the local commit and report the review URL plus the current check states. Never merge and never push `main`.

## Failure rules

- Do not commit partial output.
- Do not publish raw tournament data.
- Do not publish a result that fails the archetype or image-parity floors.
- Do not open a second review for the same dated branch.
- A run with no tracked output changes is silent.
