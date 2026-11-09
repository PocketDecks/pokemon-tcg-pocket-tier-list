import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { buildRunFiles } from "../utils/build-run-files";
import { WINDOW_IDS } from "../utils/build-window-artefacts";
import { PREMIUM_ARTEFACT_NAMES, PREMIUM_DIR } from "../utils/premium-artefacts";

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
  ) as unknown as Parameters<typeof buildRunFiles>[0]["artefacts"];
  const files = buildRunFiles({
    artefacts,
    trends: [],
    cardScoresList: [],
    today: new Date(0),
    premiumDir: PREMIUM_DIR,
  });
  const analysisRoot = path.resolve(__dirname, "../..");
  const repoRoot = path.resolve(analysisRoot, "..");
  return Object.keys(files).map((key) =>
    path.relative(repoRoot, path.resolve(analysisRoot, key)).split(path.sep).join("/")
  );
};

const step = (start: string, end: string): string =>
  job.split(start)[1].split(end)[0];

const namedPaths = (section: string): string[] =>
  [...section.matchAll(/`([^`]+)`/g)].map((match) => match[1]);

describe("refresh job file lists", () => {
  it("names every file writeArtefacts stages in step 5's recovery list", () => {
    const recovery = namedPaths(step("5. Restore interrupted writes", "\n6. "));
    for (const target of writeArtefactKeys()) {
      expect(recovery).toContain(target);
    }
  });

  it("names every committed file in the step 11 commit list", () => {
    const commit = step("11. Commit only", "12. Push");
    const named = namedPaths(commit);
    expect(commit).toContain("every public data file from step 5 including each window suffix");
    expect(named).toContain("src/data/premium-deck-slugs.json");
    expect(named).toContain("public/data/data-version.json");
    for (const target of writeArtefactKeys().filter(
      (target) => !PREMIUM_ARTEFACT_NAMES.some((name) => `analysis/out/premium/${name}.json` === target)
    )) {
      if (target.startsWith("public/data/")) continue;
      expect(named).toContain(target);
    }
  });

  it("names the update timestamp at its repository path in steps 5, 10 and 11", () => {
    expect(writeArtefactKeys()).toContain("src/app/last-updated.ts");
    expect(namedPaths(step("5. Restore interrupted writes", "\n6. "))).toContain("src/app/last-updated.ts");
    expect(namedPaths(step("11. Commit only", "12. Push"))).toContain("src/app/last-updated.ts");
  });

  it("names generated hub files in the commit and silent-day instructions", () => {
    expect(step("11. Commit only", "12. Push")).toContain("public/data/hubs/");
    expect(step("9. Inspect", "10. From")).toContain("public/data/hubs/");
  });

  it("excludes the always-changed timestamp from the silent-day check", () => {
    const check = step("9. Inspect", "10. From");
    expect(check).toContain("other than `src/app/last-updated.ts`");
    expect(check).toContain("src/data/premium-deck-slugs.json");
    expect(check).toContain("public/data/hubs/");
    expect(check).toContain("not output");
  });
});
