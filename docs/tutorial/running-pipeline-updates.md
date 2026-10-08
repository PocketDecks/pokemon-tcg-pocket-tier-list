# Tutorial: Running a local pipeline update

This tutorial explains how to fetch Limitless tournament data and run the analysis pipeline locally. You need **Node.js 24.18.1**, the version the CI workflows pin, and **Yarn** installed on your system.

## Acquiring an API key

The pipeline pulls tournament data from Limitless. You must generate your own API key from their developer portal. Maintainers do not provide shared keys. Keep your key secure and do not commit it to the repository.  

## Installing dependencies

The analysis pipeline has its own dependencies separate from the React frontend. Navigate to the analysis directory and install them.   
```bash
cd analysis
yarn install
```

## Handling the data state

The `analysis/data/` folder is **gitignored.** The scripts look for `decks.json` and `processed-tournaments.json` in this directory.     
If you start from scratch, you must create these files and initialise them with an empty JSON array (`[]`). If you leave the files completely blank, the parser will throw an error. To save time, you can always ask a maintainer for a recent copy of these files.

## Running the fetch script

The pipeline reads the key from `LIMITLESS_API_KEY` in the root `.env` file. Copy `.env.example` to `.env`, add your key, and run the download script. The script skips any tournament already listed in your `processed-tournaments.json` file.
```bash
yarn download
```

## Generating the JSON files

Run the start command to score the data and generate the frontend files.  
```bash
yarn start
```
The script writes the output to `public/data/best-decks.json`, `public/data/card-scores.json`, and `public/data/matchup-data.json`.    
Start the React server in the root directory to see your changes in the application.  