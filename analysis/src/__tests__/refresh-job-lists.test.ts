import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { buildRunFiles } from "../utils/build-run-files";
import { WINDOW_IDS } from "../utils/build-window-artefacts";
import { PREMIUM_DIR, PREMIUM_ARTEFACT_NAMES } from "../utils/premium-artefacts";
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

const namedPaths = (section: string): string[] =>
  [...section.matchAll(/`([^`]+)`/g)].map((match) => match[1]);

describe("refresh job file lists", () => {
  it("allows every file writeArtefacts stages in generated-output recovery", () => {
    for (const target of writeArtefactKeys()) {
      expect(REFRESH_OUTPUT_FILES).toContain(target);
    }
  });

  it("stages outputs from the shared allowlist", () => {
    const commit = step("11. Run", "12. Push");
    expect(commit).toContain("refresh:outputs stage");
    expect(REFRESH_OUTPUT_FILES).toContain("src/data/premium-deck-slugs.json");
    expect(REFRESH_OUTPUT_FILES).toContain("src/data/deck-hub-slugs.json");
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

  it("runs recovery before mutations and stops after pairing or golden failures", () => {
    expect(job.indexOf("refresh:outputs recover")).toBeLessThan(job.indexOf("sync-pairings"));
    expect(step("3. From", "4. From")).toMatch(/refresh:outputs begin[\s\S]*?stop if it fails/i);
    expect(step("3. From", "4. From")).toMatch(/sync-pairings[\s\S]*?checkpoint[\s\S]*?stop[\s\S]*?non-zero/i);
    expect(step("4. From", "5. Run")).toMatch(/golden:generate[\s\S]*?checkpoint[\s\S]*?stop[\s\S]*?non-zero/i);
    expect(job).toContain("A killed run needs the recovery in step 1");
    expect(job).not.toContain("A killed run needs the recovery in step 5");
  });

  it("runs validate:refresh from analysis and stops on every late step", () => {
    const generation = step("7. From", "8. Run");
    expect(generation).toMatch(/From `analysis\/`, run `yarn\.cmd validate:refresh`/);
    expect(generation).toContain("analysis/package.json");
    for (const [start, end] of [
      ["9. Inspect", "10. From"],
      ["11. Run", "12. Push"],
      ["12. Push", "13. Read"],
    ] as const) {
      expect(step(start, end)).toMatch(/stop on any non-zero exit/i);
    }
  });

  it("refuses a download rerun after recovery inside the same run", () => {
    const download = step("6. From", "7. From");
    expect(download).toContain("Do not rerun inside the same run after recovery");
    expect(download).toContain("recovery removes the refresh journal");
    expect(download).toMatch(/refresh:outputs begin[\s\S]*?step 3/);
    expect(job).toContain("never rerun after recovery inside the same run");
  });

  it("ends every numbered step with a full stop", () => {
    const lines = job.split("\n").filter((line) => /^\d+\. /.test(line));
    expect(lines).toHaveLength(13);
    for (const line of lines) expect(line.endsWith(".")).toBe(true);
  });

  it("serves the deployed version document without the 300 s CDN cache", () => {
    const hosting = JSON.parse(fs.readFileSync(path.join(__dirname, "../../../firebase.json"), "utf8")) as {
      hosting: { headers: { source: string; headers: { key: string; value: string }[] }[] };
    };
    const rules = hosting.hosting.headers;
    const bulk = rules.findIndex((rule) => rule.source === "/data/**");
    const version = rules.findIndex((rule) => rule.source === "/data/data-version.json");
    expect(bulk).toBeGreaterThanOrEqual(0);
    // Hosting applies the last matching header rule, so the specific rule
    // must come after the /data/** rule to take effect.
    expect(version).toBeGreaterThan(bulk);
    expect(rules[version].headers.find((header) => header.key === "Cache-Control")?.value).toMatch(/no-store/);
  });

  it("generates hub slugs before checking generated files", () => {
    const generation = step("7. From", "8. Run");
    expect(generation.indexOf("build-deck-archive.mjs")).toBeLessThan(generation.indexOf("generate-deck-hub-slugs.mjs"));
    expect(generation.indexOf("generate-deck-hub-slugs.mjs")).toBeLessThan(generation.indexOf("generate-deck-redirects.mjs"));
    expect(generation.indexOf("generate-deck-redirects.mjs")).toBeLessThan(job.indexOf("validate:refresh"));
  });

  it("publishes premium in step 10 in dry-run, publish, verify order", () => {
    const publish = step("10. From", "11. Run");
    expect(publish).toContain("publish:premium --dry-run");
    expect(publish.indexOf("publish:premium --dry-run")).toBeLessThan(publish.indexOf("publish:premium`"));
    expect(publish.indexOf("publish:premium`")).toBeLessThan(publish.indexOf("verify:premium"));
    expect(publish).toMatch(/non-zero exit[\s\S]*?refusal/i);
  });

  it("uses canonical premium retention and documents publication lock recovery", () => {
    const prerequisite = step("## Prerequisite", "## Prompt");
    const checkout = step("1. From", "2. Create");
    expect(prerequisite).toMatch(/GitHub repository URL[\s\S]*?canonical `main`/i);
    expect(prerequisite).toMatch(/deployed version[\s\S]*?open pull requests?/i);
    expect(prerequisite).toMatch(/publication lock[\s\S]*?crash[\s\S]*?confirm[\s\S]*?owner/i);
    expect(checkout).toMatch(/GitHub URL resolves to the canonical repository[\s\S]*?alias can vary/i);
    expect(job).not.toContain("origin/main");
  });

  it("matches the premium publication guide to step 10 and the separate image commit", () => {
    expect(job).toContain("before step 10 runs");
    expect(premiumGuide).toContain("step 10");
    expect(premiumGuide).not.toContain("step 9");
    expect(premiumGuide).toContain("can fail after JSON publication");
  });

  it("names the publishability guard beside the generation command", () => {
    const generation = step("7. From", "8. Run");
    expect(generation).toContain("yarn.cmd start");
    expect(generation.indexOf("yarn.cmd start")).toBeLessThan(generation.indexOf("assertPublishable"));
  });

  it("names generated hub files in the commit and silent-day instructions", () => {
    expect(REFRESH_OUTPUT_TREES).toContain("public/data/hubs");
    expect(step("9. Inspect", "10. From")).toContain("hub");
  });

  it("stops on failed recovery, fetch, branch, and root generator commands", () => {
    expect(step("1. From", "2. Create")).toMatch(/recover[\s\S]*?stop[\s\S]*?fetch[\s\S]*?(?:stop|stopping) if either command fails/i);
    expect(step("2. Create", "3. From")).toMatch(/branch[\s\S]*?stop if branch creation or checkout fails/i);
    const generation = step("7. From", "8. Run");
    for (const command of ["build-deck-archive.mjs", "generate-deck-hub-slugs.mjs", "generate-deck-redirects.mjs"]) {
      expect(generation.indexOf(command)).toBeGreaterThanOrEqual(0);
    }
    expect(generation).toMatch(/checkpointing each command and stopping on its failure/i);
  });

  it("preserves the raw-store backup and human-review stop rule", () => {
    const verify = step("5. Run", "6. From");
    expect(verify).toContain("analysis/data-backup/YYYY-MM-DD/");
    expect(verify).toContain("Never delete or restore raw-store files automatically");
    expect(verify).toContain("processed-tournaments.json");
  });

  it("defines silence by the classifier, excluding timestamps and counting premium output", () => {
    const check = step("9. Inspect", "10. From");
    expect(check).toContain("classifier prints no paths");
    expect(check).toContain("excludes `src/app/last-updated.ts`");
    expect(check).toContain("includes ignored premium outputs");
    expect(check).toContain("hub files count as output");
    expect(job).not.toContain("A run with no tracked output changes is silent");
    expect(job).toContain("A run is silent only when `yarn.cmd refresh:outputs classify` prints no paths");
  });
});
