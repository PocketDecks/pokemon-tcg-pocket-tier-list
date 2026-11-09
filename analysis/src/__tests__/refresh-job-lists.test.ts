import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { buildRunFiles } from "../utils/build-run-files";
import { WINDOW_IDS } from "../utils/build-window-artefacts";
import { PREMIUM_ARTEFACT_NAMES, PREMIUM_DIR } from "../utils/premium-artefacts";
import { REFRESH_OUTPUT_FILES, REFRESH_OUTPUT_TREES } from "../../scripts/refresh-outputs";

const job = fs.readFileSync(
  path.join(__dirname, "../../../cronjob/local-analysis-data-refresh-pr.md"),
  "utf8"
);
const premiumGuide = fs.readFileSync(path.join(__dirname, "../../../docs/how-to/publish-premium-data.md"), "utf8");

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

describe("refresh job file lists", () => {
  it("uses step 10 and describes the separate image commit", () => {
    expect(job).toContain("before step 10 runs");
    expect(premiumGuide).toContain("at step 10");
    expect(premiumGuide).not.toContain("at step 9");
    expect(premiumGuide).toContain("can fail after JSON publication");
  });

  it("generates hub slugs before the generated-file check", () => {
    expect(job.indexOf("generate-deck-hub-slugs.mjs")).toBeGreaterThanOrEqual(0);
    expect(job.indexOf("generate-deck-hub-slugs.mjs")).toBeLessThan(job.indexOf("check:generated"));
  });

  it("recovers before mutations and stops after pairing or golden failures", () => {
    expect(job.indexOf("refresh:outputs recover")).toBeLessThan(job.indexOf("sync-pairings"));
    expect(step("3. From", "4. From")).toMatch(/sync-pairings[\s\S]*?checkpoint[\s\S]*?non-zero[\s\S]*?stop/i);
    expect(step("4. From", "5. Run")).toMatch(/golden:generate[\s\S]*?checkpoint[\s\S]*?non-zero[\s\S]*?stop/i);
  });

  it("names start as the command guarded by assertPublishable", () => {
    const generation = step("7. From", "8. Run");
    expect(generation).toContain("yarn.cmd start");
    expect(generation.indexOf("yarn.cmd start")).toBeLessThan(generation.indexOf("assertPublishable"));
  });

  it("checks premium dry-run, publish and verify in step 10 and stops on failure", () => {
    const publish = step("10. From", "11. Run");
    expect(publish).toContain("publish:premium --dry-run");
    expect(publish.indexOf("publish:premium --dry-run")).toBeLessThan(publish.indexOf("publish:premium`"));
    expect(publish.indexOf("publish:premium`")).toBeLessThan(publish.indexOf("verify:premium"));
    expect(publish).toMatch(/stop[\s\S]*?non-zero exit/i);
  });

  it("allows every file writeArtefacts stages in recovery and staging", () => {
    for (const target of writeArtefactKeys()) {
      expect(REFRESH_OUTPUT_FILES).toContain(target);
    }
  });

  it("stages the shared generated-output allowlist", () => {
    const commit = step("11. Run", "12. Push");
    expect(commit).toContain("refresh:outputs stage");
    expect(REFRESH_OUTPUT_FILES).toContain("src/data/premium-deck-slugs.json");
    expect(REFRESH_OUTPUT_FILES).toContain("public/data/data-version.json");
    expect(REFRESH_OUTPUT_FILES).toContain("public/data/deck-archive.json");
    expect(REFRESH_OUTPUT_TREES).toContain("public/data/hubs");
    expect(REFRESH_OUTPUT_TREES).toContain("public/og/deck");
    for (const name of PREMIUM_ARTEFACT_NAMES) expect(REFRESH_OUTPUT_FILES).toContain(`analysis/out/premium/${name}.json`);
  });

  it("keeps the update timestamp in the generated-output allowlist", () => {
    expect(writeArtefactKeys()).toContain("src/app/last-updated.ts");
    expect(REFRESH_OUTPUT_FILES).toContain("src/app/last-updated.ts");
  });

  it("names generated hub files in the commit and silent-day instructions", () => {
    expect(REFRESH_OUTPUT_TREES).toContain("public/data/hubs");
    expect(step("9. Inspect", "10. From")).toContain("hub files count as output");
  });

  it("excludes the always-changed timestamp from the silent-day check", () => {
    const check = step("9. Inspect", "10. From");
    expect(check).toContain("only `src/app/last-updated.ts` changed");
  });
});
