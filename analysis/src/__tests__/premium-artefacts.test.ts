import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  PREMIUM_ARTEFACT_NAMES,
  PREMIUM_DIR,
  PREMIUM_WINDOWS,
  premiumFilePath,
  premiumVersion,
  previousPremiumDir,
  renderDataVersion,
  splitArtefactFiles,
  snapshotPremiumPrevious,
} from "../utils/premium-artefacts";

const DECKS = Array.from({ length: 12 }, (_, index) => `deck-${index}`);

const bestDecks = (reverse: boolean): string =>
  JSON.stringify(
    DECKS.map((name, index) => ({
      name,
      powerScore: reverse ? index : 100 - index,
    })),
    null,
    2
  );

const matchupData = (): string =>
  JSON.stringify(
    Object.fromEntries(
      DECKS.map((name) => [
        name,
        [
          ...DECKS.filter((other) => other !== name).map((other) => ({
            name: other,
            winRate: 0.6,
            totalGames: 9,
          })),
          { name: "Total", winRate: 0.55, totalGames: 99 },
        ],
      ])
    ),
    null,
    2
  );

const metaShare = (window: string): string =>
  JSON.stringify(
    {
      generatedAt: "2026-11-07T00:00:00.000Z",
      windowDays: window === "10d" ? 10 : 20,
      decks: DECKS.map((name, index) => ({
        name,
        share: 0.1 - index * 0.001,
        sharePrev: 0.05,
        delta: 0.05 - index * 0.001,
        windowGames: 100 - index,
        firstSeen: "2026-10-01",
        isNew: index % 2 === 0,
      })),
    },
    null,
    2
  );

const DIR = "../public/data/";

const buildFiles = (): Record<string, string> => {
  const files: Record<string, string> = {};
  for (const window of ["10d", "20d", "30d", "all"]) {
    files[`${DIR}best-decks-${window}.json`] = bestDecks(window === "10d");
    files[`${DIR}matchup-data-${window}.json`] = matchupData();
    files[`${DIR}meta-share-${window}.json`] = metaShare(window);
  }
  files[`${DIR}best-decks.json`] = files[`${DIR}best-decks-20d.json`];
  files[`${DIR}matchup-data.json`] = files[`${DIR}matchup-data-20d.json`];
  files[`${DIR}meta-share.json`] = files[`${DIR}meta-share-20d.json`];
  files[`${DIR}card-scores.json`] = "[]";
  files[`${DIR}historical-trends.json`] = "[]";
  files["../src/app/last-updated.ts"] = "export const LAST_UPDATED = 1;";
  return files;
};

const freeIn = (window: "10d" | "20d"): string[] =>
  window === "10d" ? DECKS.slice(2) : DECKS.slice(0, 10);

describe("premium artefact names", () => {
  it("lists the ten artefacts", () => {
    expect([...PREMIUM_ARTEFACT_NAMES].sort()).toEqual([
      "best-decks-30d",
      "best-decks-all",
      "matchup-data-10d",
      "matchup-data-20d",
      "matchup-data-30d",
      "matchup-data-all",
      "meta-share-10d",
      "meta-share-20d",
      "meta-share-30d",
      "meta-share-all",
    ]);
    expect(PREMIUM_WINDOWS).toEqual(["30d", "all"]);
  });

  it("resolves the premium directory inside the gitignored analysis out folder", () => {
    expect(PREMIUM_DIR.split(path.sep).slice(-3)).toEqual(["analysis", "out", "premium"]);
    expect(premiumFilePath("best-decks-30d")).toBe(path.join(PREMIUM_DIR, "best-decks-30d.json"));
  });
});

describe("splitArtefactFiles", () => {
  it("puts the ten full artefacts in the premium files", () => {
    const { premiumFiles } = splitArtefactFiles(buildFiles());

    expect(Object.keys(premiumFiles).sort()).toEqual([...PREMIUM_ARTEFACT_NAMES].sort());
  });

  it("keeps the 30d and all-time files out of the public files", () => {
    const { publicFiles } = splitArtefactFiles(buildFiles());

    expect(Object.keys(publicFiles).some((key) => /-(30d|all).json$/.test(key))).toBe(false);
  });

  it("carries the full 10d and 20d matchups and meta share into the premium files unchanged", () => {
    const files = buildFiles();
    const { premiumFiles } = splitArtefactFiles(files);

    expect(premiumFiles["matchup-data-20d"]).toBe(files[`${DIR}matchup-data-20d.json`]);
    expect(premiumFiles["meta-share-10d"]).toBe(files[`${DIR}meta-share-10d.json`]);
    expect(premiumFiles["matchup-data-30d"]).toBe(files[`${DIR}matchup-data-30d.json`]);
  });

  it("leaves best-decks public and whole for 10d, 20d and the default", () => {
    const files = buildFiles();
    const { publicFiles } = splitArtefactFiles(files);

    for (const name of ["best-decks", "best-decks-10d", "best-decks-20d"]) {
      expect(publicFiles[`${DIR}${name}.json`]).toBe(files[`${DIR}${name}.json`]);
    }
  });

  it("trims the public matchups to full rows for the free decks and Total for the rest", () => {
    const { publicFiles } = splitArtefactFiles(buildFiles());
    const trimmed = JSON.parse(publicFiles[`${DIR}matchup-data-20d.json`]);

    for (const name of DECKS) {
      const names = trimmed[name].map((row: { name: string }) => row.name);
      if (freeIn("20d").includes(name)) expect(names).toHaveLength(DECKS.length);
      else expect(names).toEqual(["Total"]);
    }
  });

  it("trims the public meta share to name, share and window games for the other decks", () => {
    const { publicFiles } = splitArtefactFiles(buildFiles());
    const trimmed = JSON.parse(publicFiles[`${DIR}meta-share-20d.json`]);

    for (const entry of trimmed.decks) {
      if (freeIn("20d").includes(entry.name)) {
        expect(Object.keys(entry)).toContain("delta");
      } else {
        expect(Object.keys(entry)).toEqual(["name", "share", "windowGames"]);
      }
    }
  });

  it("chooses the free decks from each window's own ranking", () => {
    const { publicFiles } = splitArtefactFiles(buildFiles());
    const tenDay = JSON.parse(publicFiles[`${DIR}matchup-data-10d.json`]);
    const twentyDay = JSON.parse(publicFiles[`${DIR}matchup-data-20d.json`]);

    expect(tenDay["deck-0"]).toHaveLength(1);
    expect(twentyDay["deck-0"]).toHaveLength(DECKS.length);
    expect(tenDay["deck-11"]).toHaveLength(DECKS.length);
    expect(twentyDay["deck-11"]).toHaveLength(1);
  });

  it("trims the un-suffixed files against the default ranking, matching 20d", () => {
    const { publicFiles } = splitArtefactFiles(buildFiles());

    expect(publicFiles[`${DIR}matchup-data.json`]).toBe(publicFiles[`${DIR}matchup-data-20d.json`]);
    expect(publicFiles[`${DIR}meta-share.json`]).toBe(publicFiles[`${DIR}meta-share-20d.json`]);
  });

  it("refuses to trim a window whose ranking is missing", () => {
    const files = buildFiles();
    delete files[`${DIR}best-decks-10d.json`];

    expect(() => splitArtefactFiles(files)).toThrow(/best-decks-10d/);
  });

  it("leaves every other file alone", () => {
    const files = buildFiles();
    const { publicFiles } = splitArtefactFiles(files);

    expect(publicFiles[`${DIR}card-scores.json`]).toBe("[]");
    expect(publicFiles["../src/app/last-updated.ts"]).toBe("export const LAST_UPDATED = 1;");
    expect(Object.keys(publicFiles)).toHaveLength(12);
  });
});

describe("premiumVersion", () => {
  const files = (): Record<string, string> => ({
    "best-decks-30d": "a",
    "best-decks-all": "b",
    "matchup-data-30d": "c",
  });

  it("is sixteen lowercase hex characters", () => {
    expect(premiumVersion(files())).toMatch(/^[0-9a-f]{16}$/);
  });

  it("is deterministic and independent of key order", () => {
    const reordered = {
      "matchup-data-30d": "c",
      "best-decks-all": "b",
      "best-decks-30d": "a",
    };
    expect(premiumVersion(files())).toBe(premiumVersion(files()));
    expect(premiumVersion(reordered)).toBe(premiumVersion(files()));
  });

  it("changes when one payload changes", () => {
    expect(premiumVersion({ ...files(), "best-decks-all": "B" })).not.toBe(
      premiumVersion(files())
    );
  });

  it("changes when a name changes with the same content", () => {
    expect(premiumVersion({ x: "a" })).not.toBe(premiumVersion({ y: "a" }));
  });

  it("does not confuse a boundary shift between a name and its content", () => {
    expect(premiumVersion({ ab: "c" })).not.toBe(premiumVersion({ a: "bc" }));
  });
});

describe("renderDataVersion", () => {
  it("renders the premium version with a trailing newline", () => {
    expect(renderDataVersion("0123456789abcdef")).toBe('{ "premium": "0123456789abcdef" }\n');
  });
});

describe("snapshotPremiumPrevious", () => {
  it("copies the premium files aside so the next run can compare with them", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "premium-previous-"));
    const premium = path.join(dir, "premium");
    fs.mkdirSync(premium);
    fs.writeFileSync(path.join(premium, "best-decks-30d.json"), "[1]");
    snapshotPremiumPrevious(premium);
    const previous = previousPremiumDir(premium);
    expect(fs.readFileSync(path.join(previous, "best-decks-30d.json"), "utf8")).toBe("[1]");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("copies nothing when the premium directory does not exist", () => {
    snapshotPremiumPrevious(path.join(os.tmpdir(), "premium-missing-12345"));
    expect(fs.existsSync(previousPremiumDir(path.join(os.tmpdir(), "premium-missing-12345")))).toBe(false);
  });
});

describe("snapshotPremiumPrevious truncation guard", () => {
  it("skips files that do not parse as JSON arrays", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "premium-truncated-"));
    const premium = path.join(dir, "premium");
    fs.mkdirSync(premium);
    fs.writeFileSync(path.join(premium, "good.json"), "[1]");
    fs.writeFileSync(path.join(premium, "truncated.json"), "[1,2");
    fs.writeFileSync(path.join(premium, "object.json"), "{}");
    snapshotPremiumPrevious(premium);
    const previous = previousPremiumDir(premium);
    expect(fs.existsSync(path.join(previous, "good.json"))).toBe(true);
    expect(fs.existsSync(path.join(previous, "truncated.json"))).toBe(false);
    expect(fs.existsSync(path.join(previous, "object.json"))).toBe(false);
    const leftovers = fs.readdirSync(previous).filter((name) => name.includes("tmp"));
    expect(leftovers).toEqual([]);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
