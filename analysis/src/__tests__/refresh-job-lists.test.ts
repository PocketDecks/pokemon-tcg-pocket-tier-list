import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { buildArtefactFiles, WINDOW_IDS } from "../utils/build-window-artefacts";
import { splitArtefactFiles } from "../utils/premium-artefacts";

const job = fs.readFileSync(
  path.join(__dirname, "../../../cronjob/local-analysis-data-refresh-pr.md"),
  "utf8"
);

const stagedTargets = (): string[] => {
  const artefacts = Object.fromEntries(
    WINDOW_IDS.map((window) => [
      window,
      {
        bestDecks: [],
        metaShare: { decks: [], windowGames: 0, windowDays: 0 },
        matchupData: { rows: [] },
      },
    ])
  ) as unknown as Parameters<typeof buildArtefactFiles>[0];
  const { publicFiles, premiumFiles } = splitArtefactFiles(
    buildArtefactFiles(artefacts)
  );
  const publicKeys = Object.keys(publicFiles).map((key) =>
    key.replace(/^\.\.\//, "")
  );
  return [
    ...publicKeys,
    ...Object.keys(premiumFiles).map((name) => `${name}.json`),
    "public/data/data-version.json",
    "src/data/premium-deck-slugs.json",
    "public/data/historical-trends.json",
    "public/data/card-scores.json",
    "src/app/last-updated.ts",
  ];
};

const committedTargets = (): string[] =>
  stagedTargets().filter(
    (target) =>
      !/^(best-decks|matchup-data|meta-share)-(30d|all)\.json$/.test(target) &&
      !/^(matchup-data|meta-share)-(10d|20d)\.json$/.test(target)
  );

const step = (start: string, end: string): string =>
  job.split(start)[1].split(end)[0];

describe("refresh job file lists", () => {
  it("names every file writeArtefacts stages in step 5's recovery list", () => {
    const recovery = step("5. Restore interrupted writes", "\n6. ");
    for (const target of stagedTargets()) {
      expect(recovery).toContain(target);
    }
  });

  it("names every committed file in the step 11 commit list", () => {
    const commit = step("11. Commit only", "12. Push");
    expect(commit).toContain("every public data file from step 5 including each window suffix");
    expect(commit).toContain("src/data/premium-deck-slugs.json");
    expect(commit).toContain("public/data/data-version.json");
    for (const target of committedTargets()) {
      if (target.startsWith("public/data/")) continue;
      expect(commit).toContain(target);
    }
  });

  it("excludes the always-changed timestamp from the silent-day check", () => {
    const check = step("10. Inspect", "11. Commit only");
    expect(check).toContain("other than `src/app/last-updated.ts`");
    expect(check).toContain("not output");
  });
});
