import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { buildArtefactFiles, WINDOW_IDS } from "../utils/build-window-artefacts";
import { PREMIUM_ARTEFACT_NAMES } from "../utils/premium-artefacts";
import { PREMIUM_DECK_SLUGS_FILE } from "../utils/premium-deck-slugs";

const job = fs.readFileSync(
  path.join(__dirname, "../../../cronjob/local-analysis-data-refresh-pr.md"),
  "utf8"
);

const stagedTargets = (): string[] => {
  const artefacts = Object.fromEntries(
    WINDOW_IDS.map((window) => [
      window,
      { bestDecks: [], metaShare: {}, matchupData: {} },
    ])
  ) as unknown as Parameters<typeof buildArtefactFiles>[0];
  const publicKeys = Object.keys(buildArtefactFiles(artefacts)).map((key) =>
    key.replace(/^\.\.\//, "")
  );
  return [
    ...publicKeys,
    ...PREMIUM_ARTEFACT_NAMES.map((name) => `${name}.json`),
    "public/data/data-version.json",
    PREMIUM_DECK_SLUGS_FILE.replace(/^\.\.\//, ""),
    "public/data/historical-trends.json",
    "public/data/card-scores.json",
    "src/app/last-updated.ts",
  ];
};

const committedTargets = (): string[] =>
  stagedTargets().filter(
    (target) => !PREMIUM_ARTEFACT_NAMES.some((name) => `${name}.json` === target)
  );

describe("refresh job file lists", () => {
  it("names every file writeArtefacts stages in the recovery list", () => {
    const recovery = job.split("## Failure rules")[0].split("5. Restore interrupted writes")[1];
    for (const target of stagedTargets()) {
      expect(recovery).toContain(target);
    }
  });

  it("names every file the commit list stages", () => {
    const commit = job.split("11. Commit only")[1].split("12. Push")[0];
    expect(commit).toContain("every public data file from step 5 including each window suffix");
    expect(commit).toContain("src/data/premium-deck-slugs.json");
    expect(commit).toContain("public/data/data-version.json");
    for (const target of committedTargets()) {
      if (target.startsWith("public/data/")) continue;
      expect(commit).toContain(target);
    }
  });

  it("the silent-day check names the files that count as output", () => {
    const check = job.split("10. Inspect")[1].split("11. Commit only")[0];
    expect(check).toContain("public data file from step 5");
    for (const target of committedTargets()) {
      if (target.startsWith("public/data/")) continue;
      expect(check).toContain(target);
    }
  });
});
