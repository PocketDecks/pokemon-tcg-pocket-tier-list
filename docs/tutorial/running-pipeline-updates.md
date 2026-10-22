# Tutorial: Running a local pipeline update

This tutorial explains how to fetch Limitless tournament data and run the analysis pipeline locally. You need **Node.js 24.22.1**, the version the CI workflows pin, and **Yarn** installed on your system.

## Acquiring an API key

The pipeline pulls tournament data from Limitless. You must generate your own API key from their developer portal. Maintainers do not provide shared keys. Keep your key secure and do not commit it to the repository.

## Installing dependencies

The analysis pipeline has its own dependencies separate from the React frontend. Navigate to the analysis directory and install them.

```bash
cd analysis
yarn install
```

## Handling the data state

The `analysis/data/` folder is **gitignored.** It holds two things: `processed-tournaments.json`, the list of tournaments already fetched, and `decks/`, the deck store. The store is one NDJSON file per expansion set plus a `manifest.json` that records each shard's file, deck count and date range. `DECKS_DIR` overrides the store location and `ANALYSIS_DATA_DIR` overrides the whole data directory.

You do not need to create either by hand. The downloader makes the directory and writes the manifest itself, and an absent store reads as empty. If you hold a legacy single-file `decks.json`, convert it once with:

```bash
yarn store:migrate
```

The script reads `data/decks.json`, writes the shards, and refuses to overwrite a store that already holds decks. Pass `--from` and `--to` to point it at other paths.

## Purging non-standard tournaments

The store can hold tournaments from runs that predate the format filter, including `CUSTOM` and `NOEX` events. `store:purge-formats` removes them, and it reads the same shards the pipeline scores, so a purge can only touch the current expansion's store.

Start with the dry run. It prints one line per tournament it would remove, with its id, date, name, reason and deck count, plus a total, and writes nothing:

```bash
yarn store:purge-formats
```

Review the list, then apply it:

```bash
yarn store:purge-formats --apply
```

The apply rewrites each affected shard and its manifest entry and commits them together, so an interrupted write recovers the way an interrupted download does. It leaves `processed-tournaments.json` untouched, so a removed tournament is not downloaded again, and it refuses before writing anything if a shard would end up empty. The purge takes the same lock as the download, so one of the two stops while the other runs. Pass `--dir` to point it at another store location.

Run `yarn store:verify` afterwards to confirm the store.

## Checking the store

```bash
yarn store:verify
```

This reads the manifest and every shard it names and reports the problems it finds: a manifest count that disagrees with the file's line count, a missing shard file, a manifest date range that disagrees with the shard's contents, a deck id present in two shards, a deck stored in a shard other than the one its date belongs to, an untracked `.ndjson` file, and a stray `.tmp`, `.bak` or `.created` file. An empty `.created` marker beside a target records that the target did not exist before the write, so a recovery deletes it rather than restoring it. It prints `N shards, M decks` and exits non-zero when it finds a problem, and also when the store directory is absent or holds no shards, unless you pass `--allow-empty`. Run it after a migration or after any run that was interrupted.

## Running the fetch script

The pipeline reads the key from `LIMITLESS_API_KEY` in the root `.env` file. From the repository root, copy `.env.example` to `.env` and add your key. Then return to `analysis/` and run the download script. The script skips any tournament already listed in your `processed-tournaments.json` file.

```bash
cd analysis
yarn download
```

The downloader commits a batch at a time, so a run that throws rolls back the batch in flight and keeps the batches that finished. A rerun resumes from them and does not duplicate a deck. A hard kill can stop the write between two renames, leaving the shard and manifest on the new batch while `processed-tournaments.json` holds the old list; the next run then refuses those decks as duplicates. A `.tmp` beside a target means the save did not finish, so delete every target that has a `.created` marker beside it together with that marker, move the `.bak` files back over their targets, and delete the `.tmp` files; with no `.tmp` left the save finished, so delete the `.bak` files and every `.created` marker and keep the new ones. If the download still refuses with `Deck ... already exists in shard` or `Shard ... exists at ... but the manifest has no entry for it`, delete `analysis/data/decks/` and `analysis/data/processed-tournaments.json` together and rerun the download, which rebuilds both from the API.

## Generating the JSON files

Run the start command to score the data and generate the frontend files.

```bash
yarn start
```

The command refuses to publish when a check fails, printing each failure and exiting 1. Otherwise it writes the frontend data to `public/data/`: `best-decks`, `meta-share` and `matchup-data` for each window (`10d`, `20d`, `30d`, `all`), the un-suffixed copies of the `20d` files, plus `historical-trends.json` and `card-scores.json`. [Pipeline output contract](../reference/pipeline-output-contract.md) lists every file and field. Start the React server in the root directory to see your changes in the application.
