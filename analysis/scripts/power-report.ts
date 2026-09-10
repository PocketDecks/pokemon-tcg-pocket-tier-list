// Prints the current Power ranking so a human can sanity-check a tuning
// change. Deliberately not a test: these numbers move with every scrape.
//
//   cd analysis && yarn power:report
import metaShare from "../../public/data/meta-share.json";
import matchupData from "../../public/data/matchup-data.json";
import { PipelineMatchupData, PipelineMetaShare } from "../../src/types/pipeline-data";
import { buildDeckPower, DeckPowerInput } from "../src/utils/build-deck-power";
import { MIN_FIELD_COVERAGE } from "../src/settings";

const share = metaShare as PipelineMetaShare;
const matchups = matchupData as PipelineMatchupData;

const inputs: DeckPowerInput[] = share.decks.map((entry) => ({
  name: entry.name,
  matchups: matchups[entry.name] ?? [],
  games14: entry.games14,
}));

const rows = buildDeckPower(inputs);
const ranked = rows.filter((r) => r.powerScore !== null);
ranked.sort((a, b) => (b.powerScore ?? 0) - (a.powerScore ?? 0));

console.log(`ranked ${ranked.length}/${rows.length} at MIN_FIELD_COVERAGE=${MIN_FIELD_COVERAGE}\n`);
console.log("rank  power   freq    meta    cov   deck");
ranked.forEach((r, i) => {
  console.log(
    `${String(i + 1).padStart(4)}  ${(r.powerScore ?? 0).toFixed(1).padStart(5)}   ` +
      `${r.freqScore.toFixed(1).padStart(5)}   ${(r.metaScore ?? 0).toFixed(1).padStart(5)}   ` +
      `${r.fieldCoverage.toFixed(2)}  ${r.name}`
  );
});

const unranked = rows.filter((r) => r.powerScore === null);
console.log(`\nunranked (${unranked.length}):`);
unranked
  .sort((a, b) => b.freqScore - a.freqScore)
  .forEach((r) => console.log(`  cov=${r.fieldCoverage.toFixed(2)}  freq=${r.freqScore.toFixed(1)}  ${r.name}`));
