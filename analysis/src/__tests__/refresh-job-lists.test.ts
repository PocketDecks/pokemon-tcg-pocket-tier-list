import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { buildArtefactFiles, WINDOW_IDS } from "../utils/build-window-artefacts";
import { PREMIUM_DECK_SLUGS_FILE } from "../utils/premium-deck-slugs";
import {
  PREMIUM_ARTEFACT_NAMES,
  PREMIUM_DIR,
  premiumFilePath,
  splitArtefactFiles,
} from "../utils/premium-artefacts";

const job = fs.readFileSync(
  path.join(__dirname, "../../../cronjob/local-analysis-data-refresh-pr.md"),
  "utf8"
);

const writeArtefactKeys = (): string[] => {
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
  const { publicFiles, premiumFiles } = splitArtefactFiles(buildArtefactFiles(artefacts));
  const files = {
    ...publicFiles,
    ...Object.fromEntries(
      Object.keys(premiumFiles).map((name) => [premiumFilePath(name, PREMIUM_DIR), ""])
    ),
    "../public/data/data-version.json": "",
    [PREMIUM_DECK_SLUGS_FILE]: "",
    "../public/data/historical-trends.json": "",
    "../public/data/card-scores.json": "",
    "../src/app/last-updated.ts": "",
  };
  const analysisRoot = path.resolve(__dirname, "../..");
  const repoRoot = path.resolve(analysisRoot, "..");
  return Object.keys(files).map((key) =>
    path.relative(repoRoot, path.resolve(analysisRoot, key)).split(path.sep).join("/")
  );
};

const step = (start: string, end: string): string =>
  job.split(start)[1].split(end)[0];

describe("refresh job file lists", () => {
  it("names every file writeArtefacts stages in step 5's recovery list", () => {
    const recovery = step("5. Restore interrupted writes", "\n6. ");
    for (const target of writeArtefactKeys()) {
      expect(recovery).toContain(target);
    }
  });

  it("names every committed file in the step 11 commit list", () => {
    const commit = step("11. Commit only", "12. Push");
    expect(commit).toContain("every public data file from step 5 including each window suffix");
    expect(commit).toContain("src/data/premium-deck-slugs.json");
    expect(commit).toContain("public/data/data-version.json");
    for (const target of writeArtefactKeys().filter(
      (target) => !PREMIUM_ARTEFACT_NAMES.some((name) => `analysis/out/premium/${name}.json` === target)
    )) {
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
