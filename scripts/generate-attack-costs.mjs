// scripts/generate-attack-costs.mjs
//
// Regenerates src/data/attack-costs.json from the v5 npm package's card
// payload. Task 4 will replace the runtime parse in cards-api.ts with a
// fetch of this file; the build-time export keeps the 1.19 MiB payload out
// of the frontend bundle.
import fs from "fs";
import path from "path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const PACKAGE_REL = "pokemon-tcg-pocket-cards/data/v5/cards.gameplay.no-image.min.json";

const resolveSourcePath = (cwd) => {
  try {
    return require.resolve(path.join(cwd, "node_modules", PACKAGE_REL));
  } catch {
    return path.join(cwd, "node_modules", PACKAGE_REL);
  }
};

const buildTable = (records) => {
  const table = {};
  for (const record of records) {
    if (record == null || record.deckBuilderNr == null) continue;
    const attacks = record.attacks;
    if (attacks == null) continue;
    const costs = {};
    let hasCost = false;
    for (const [key, attack] of Object.entries(attacks)) {
      if (attack && typeof attack.cost === "string" && attack.cost.length > 0) {
        costs[key] = { cost: attack.cost };
        hasCost = true;
      }
    }
    if (hasCost) {
      table[String(record.deckBuilderNr)] = costs;
    }
  }
  return table;
};

const main = () => {
  const cwd = process.cwd();
  const sourcePath = resolveSourcePath(cwd);
  if (!fs.existsSync(sourcePath)) {
    // Fail the build loudly: shipping an empty attack-cost table would silently
    // break every deck energy inference downstream.
    console.error(
      `generate-attack-costs: source payload missing at ${sourcePath}. ` +
        "Reinstall pokemon-tcg-pocket-cards (e.g. `yarn install`) before building."
    );
    process.exit(1);
  }

  const records = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
  const table = buildTable(records);

  const outPath = path.join(cwd, "src", "data", "attack-costs.json");
  const output = JSON.stringify(table, null, 2) + "\n";
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  if (process.argv.includes("--check")) {
    const current = fs.existsSync(outPath) ? fs.readFileSync(outPath, "utf8") : null;
    if (current !== output) {
      console.error(
        `generate-attack-costs: ${outPath} is out of date for ` +
          "the installed pokemon-tcg-pocket-cards package."
      );
      process.exit(1);
    }
    console.log(`generate-attack-costs: ${outPath} is current`);
    return;
  }

  fs.writeFileSync(outPath, output);

  console.log(
    `generate-attack-costs: wrote ${Object.keys(table).length} entries to ${outPath}`
  );
};

main();