import { WINDOW_IDS } from "../../../src/types/meta-windows";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { buildRunFiles } from "../utils/build-run-files";

import { PREMIUM_DIR, PREMIUM_ARTEFACT_NAMES } from "../utils/premium-artefacts";
import { REFRESH_OUTPUT_FILES, REFRESH_OUTPUT_TREES } from "../../scripts/refresh-outputs";

const job = fs.readFileSync(
  path.join(__dirname, "../../../docs/how-to/running-the-scheduled-refresh.md"),
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
  it("lists the generated outputs in a fixed order", () => {
    expect(REFRESH_OUTPUT_FILES).toEqual([
      "analysis/src/data/limitless-decks.json",
      "analysis/src/__fixtures__/deck-name-golden.json",
      "analysis/src/data/card-printings.json",
      "src/data/premium-deck-slugs.json",
      "src/data/deck-hub-slugs.json",
      "src/app/last-updated.ts",
      "public/data/deck-archive.json",
      "firebase.json",
      "public/data/data-version.json",
      "public/data/historical-trends.json",
      "public/data/card-scores.json",
      "public/data/best-decks.json",
      "public/data/best-decks-10d.json",
      "public/data/best-decks-20d.json",
      "public/data/meta-share.json",
      "public/data/meta-share-10d.json",
      "public/data/meta-share-20d.json",
      "public/data/matchup-data.json",
      "public/data/matchup-data-10d.json",
      "public/data/matchup-data-20d.json",
      "analysis/out/premium/best-decks-30d.json",
      "analysis/out/premium/best-decks-all.json",
      "analysis/out/premium/matchup-data-30d.json",
      "analysis/out/premium/matchup-data-all.json",
      "analysis/out/premium/meta-share-30d.json",
      "analysis/out/premium/meta-share-all.json",
      "analysis/out/premium/meta-share-10d.json",
      "analysis/out/premium/meta-share-20d.json",
    ]);
  });

  it("lists every file writeArtefacts writes as a generated output", () => {
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

  it("states the review URL and the operator check-state duty", () => {
    const after = step("## After the job", "## Prerequisite");
    const checkout = step("1. Work", "2. Create");
    const branch = step("2. Create", "3. From");
    const body = step("12. Push", "13. Reads");
    const readback = step("13. Reads", "## Freshness");
    expect(checkout).toContain("refs/heads/main:refs/heads/main");
    expect(checkout).not.toContain("branch -f main");
    expect(checkout).toContain("LC_ALL=C");
    expect(branch).toContain("same C locale");
    expect(body).toContain("buildPrBody");
    expect(body).not.toContain("EN-UK");
    expect(readback).toContain("returns the review URL in the published outcome and the JSON line");
    expect(readback).toContain("does not query check states");
    expect(after).toContain("Report the current check states on the pull request yourself");
    expect(job).toContain("the line that decided the stop");
  });

  it("states the bounded JSON error report rule", () => {
    expect(job).toContain("each line is capped at 500 characters");
    expect(job).toContain("then the last other error lines, then the last progress lines");
    expect(job).toContain("At most five lines reach the JSON line");
    expect(job).toContain("the full output stays in the dated log");
  });

  it("documents local branch reuse and both index refusals", () => {
    const checkout = step("1. Work", "2. Create");
    const branch = step("2. Create", "3. From");
    const commit = step("11. Run", "12. Push");
    const recovery = step("## Recovery", "## Failure rules");
    expect(checkout).toContain("git diff --cached --name-only");
    expect(checkout).toContain("index already holds entries");
    expect(branch).toContain("git rev-parse --verify --quiet refs/heads/<branch>");
    expect(branch).toContain("checks out a local dated branch");
    expect(branch).toContain("couldn't find remote ref");
    expect(commit).toContain("naming exactly the paths the stage step printed");
    expect(commit).toContain("git diff --cached --name-only");
    expect(recovery).toContain("index already holds entries");
    expect(recovery).toContain("index has entries outside generated paths");
    expect(recovery).toContain("Follow the step 11 restore procedure below");
  });

  it("keeps the update timestamp in the generated-output allowlist", () => {
    expect(writeArtefactKeys()).toContain("src/app/last-updated.ts");
    expect(REFRESH_OUTPUT_FILES).toContain("src/app/last-updated.ts");
  });

  it("generates in a scratch worktree and stops after pairing or golden failures", () => {
    expect(job.indexOf("refresh:outputs begin")).toBeLessThan(job.indexOf("sync-pairings"));
    expect(step("3. From", "4. No")).toMatch(/refresh:outputs begin[\s\S]*?scratch worktree[\s\S]*?stop if it fails/i);
    expect(step("3. From", "4. No")).toMatch(/sync-pairings[\s\S]*?stop on a non-zero exit/i);
    expect(step("4. No", "5. Run")).toContain("command runs in step 4");
    expect(job).toContain("refresh:outputs discard");
    expect(step("7. From", "8. Run")).toMatch(/card-printings:generate[\s\S]*?golden:generate[\s\S]*?validate:refresh/);
    expect(job).toContain("/home/linuxbrew/.linuxbrew/bin/yarn");
  });

  it("runs validate:refresh from analysis and stops on every late step", () => {
    const generation = step("7. From", "8. Run");
    expect(generation).toMatch(/From `analysis\/`, run `yarn validate:refresh`/);
    expect(generation).toContain("analysis/package.json");
    for (const [start, end] of [
      ["9. From", "10. From"],
      ["11. Run", "12. Push"],
      ["12. Push", "13. Read"],
    ] as const) {
      expect(step(start, end)).toMatch(/stop on any non-zero exit/i);
    }
  });

  it("sends a killed download back to step 1 with a discard", () => {
    const download = step("6. From", "7. From");
    expect(download).toContain("refresh:outputs discard");
    expect(download).toContain("store:verify");
    expect(job).toContain("A killed run needs the discard in the Recovery section");
  });

  it("ends every numbered step with a full stop", () => {
    const lines = job.split("\n").filter((line) => /^\d+\. /.test(line));
    expect(lines).toHaveLength(13);
    for (const line of lines) expect(line.endsWith(".")).toBe(true);
  });

  it("keeps the silent-day stop and one recovery section in the job text", () => {
    expect(step("9. From", "10. From")).toContain("report a silent day and stop");
    expect(step("11. Run", "12. Push")).toContain("removes the scratch worktree");
    expect(job).toContain("## Recovery\n");
    expect(job).not.toContain("refresh:outputs recover");
    expect(job).not.toContain("refresh:outputs finish");
    expect(job).not.toContain("refresh:outputs checkpoint");
  });

  it("serves the deployed version document without the 300 s CDN cache", () => {
    const hosting = JSON.parse(fs.readFileSync(path.join(__dirname, "../../../firebase.json"), "utf8")) as {
      hosting: { headers: { source: string; headers: { key: string; value: string }[] }[] };
    };
    const rules = hosting.hosting.headers;
    const bulk = rules.findIndex((rule) => rule.source === "/data/**");
    const version = rules.findIndex((rule) => rule.source === "/data/data-version.json");
    expect(bulk).toBeGreaterThanOrEqual(0);
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
    const prerequisite = step("## Prerequisite", "## Steps the job runs");
    const checkout = step("1. Work", "2. Create");
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
    expect(generation).toContain("yarn start");
    expect(generation.indexOf("yarn start")).toBeLessThan(generation.indexOf("assertPublishable"));
  });

  it("names generated hub files in the commit and silent-day instructions", () => {
    expect(REFRESH_OUTPUT_TREES).toContain("public/data/hubs");
    expect(step("9. From", "10. From")).toContain("hub");
  });

  it("stops on failed fetch, branch, and root generator commands", () => {
    expect(step("1. Work", "2. Create")).toMatch(/fetch[\s\S]*?(?:stop|stopping) if either command fails/i);
    expect(step("2. Create", "3. From")).toMatch(/branch[\s\S]*?stop if branch creation or checkout fails/i);
    const generation = step("7. From", "8. Run");
    for (const command of ["build-deck-archive.mjs", "generate-deck-hub-slugs.mjs", "generate-deck-redirects.mjs"]) {
      expect(generation.indexOf(command)).toBeGreaterThanOrEqual(0);
    }
    expect(generation).toMatch(/stopping on the first failure/i);
  });

  it("preserves the raw-store backup and human-review stop rule", () => {
    const verify = step("5. Run", "6. From");
    expect(verify).toContain("analysis/data-backup/YYYY-MM-DD/");
    expect(verify).toContain("Never delete or restore raw-store files automatically");
    expect(verify).toContain("processed-tournaments.json");
  });

  it("defines silence by the classifier, excluding timestamps and counting premium output", () => {
    const check = step("9. From", "10. From");
    expect(check).toContain("classifier prints no paths");
    expect(check).toContain("excludes `src/app/last-updated.ts`");
    expect(check).toContain("includes ignored premium outputs");
    expect(check).toContain("hub files count as output");
    expect(job).not.toContain("A run with no tracked output changes is silent");
    expect(job).toContain("A run is silent only when `yarn refresh:outputs classify` prints no paths");
  });

  it("names the canonical repository on gh calls and the forced fetch flag", () => {
    const checkout = step("1. Work", "2. Create");
    const publish = step("12. Push", "13. Reads");
    expect(checkout).toContain("git fetch --show-forced-updates <remote> refs/heads/main:refs/heads/main");
    expect(checkout).toContain("fetch.showForcedUpdates` is false");
    expect(publish).toContain("--repo PocketDecks/pokemon-tcg-pocket-tier-list");
  });

  it("documents the silent-day publication check and manual publish steps", () => {
    const silent = step("9. From", "10. From");
    const publish = step("12. Push", "13. Read");
    expect(silent).toContain("stops for a person at step 9");
    expect(silent).toContain("git push <remote> <branch>");
    expect(silent).toContain("gh pr create --repo PocketDecks/pokemon-tcg-pocket-tier-list --base main --head <branch>");
    expect(silent).toContain("checks the local and remote dated branches");
    expect(silent).toContain("--json state` shows `MERGED");
    expect(silent).toContain("git log refs/remotes/<remote>/<branch>..<branch>` prints nothing");
    const merged = silent.slice(silent.indexOf("For a merged pull request"), silent.indexOf("On Windows 11"));
    const sequence = [
      "yarn refresh:outputs discard",
      "git checkout main",
      "git branch -D <branch>",
      "git push <remote> --delete <branch>",
    ];
    let cursor = merged.indexOf(sequence[0]);
    expect(cursor).toBeGreaterThanOrEqual(0);
    for (const step of sequence.slice(1)) {
      const next = merged.indexOf(step, cursor + 1);
      expect(next, `${step} must follow the earlier recovery steps`).toBeGreaterThan(cursor);
      cursor = next;
    }
    expect(silent).toContain("yarn.cmd refresh:outputs discard");
    expect(silent).not.toContain("delete the local dated branch and start again");
    expect(publish).not.toContain("the next run reuses it");
    expect(publish).toContain("stops for a person at step 9");
  });

  it("recovers a failed step 11 commit with the restore procedure", () => {
    const recovery = step("## Recovery", "## Failure rules");
    expect(recovery).toContain("Step 11 refuses at the commit");
    expect(recovery).toContain("stops at step 1 with `index already holds entries`");
    expect(recovery).toContain("Follow the step 11 restore procedure below, then start again at step 1.");
  });
});
