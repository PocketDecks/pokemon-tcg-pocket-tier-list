import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  PREMIUM_ARTEFACT_NAMES,
  PREMIUM_DIR,
  PREMIUM_WINDOWS,
  premiumFilePath,
  premiumVersion,
  renderDataVersion,
  splitArtefactFiles,
} from "../utils/premium-artefacts";

const PUBLIC_NAMES = [
  "best-decks",
  "best-decks-10d",
  "best-decks-20d",
  "matchup-data",
  "matchup-data-10d",
  "matchup-data-20d",
  "meta-share",
  "meta-share-10d",
  "meta-share-20d",
  "card-scores",
  "historical-trends",
];

const buildFiles = (): Record<string, string> => {
  const files: Record<string, string> = {};
  for (const name of PUBLIC_NAMES) files[`../public/data/${name}.json`] = `public ${name}`;
  for (const base of ["best-decks", "matchup-data", "meta-share"]) {
    for (const window of PREMIUM_WINDOWS) {
      files[`../public/data/${base}-${window}.json`] = `premium ${base}-${window}`;
    }
  }
  files["../src/app/last-updated.ts"] = "export const LAST_UPDATED = 1;";
  return files;
};

describe("premium artefact names", () => {
  it("lists the six window artefacts", () => {
    expect([...PREMIUM_ARTEFACT_NAMES].sort()).toEqual([
      "best-decks-30d",
      "best-decks-all",
      "matchup-data-30d",
      "matchup-data-all",
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
  it("keeps the six premium names out of the public files", () => {
    const { publicFiles, premiumFiles } = splitArtefactFiles(buildFiles());

    expect(Object.keys(premiumFiles).sort()).toEqual([...PREMIUM_ARTEFACT_NAMES].sort());
    for (const name of PREMIUM_ARTEFACT_NAMES) {
      expect(publicFiles).not.toHaveProperty([`../public/data/${name}.json`]);
    }
    expect(Object.keys(publicFiles).some((key) => /-(30d|all)\.json$/.test(key))).toBe(false);
  });

  it("carries the content across unchanged and leaves every other file alone", () => {
    const files = buildFiles();
    const { publicFiles, premiumFiles } = splitArtefactFiles(files);

    expect(premiumFiles["matchup-data-30d"]).toBe("premium matchup-data-30d");
    expect(publicFiles["../public/data/best-decks.json"]).toBe("public best-decks");
    expect(publicFiles["../src/app/last-updated.ts"]).toBe("export const LAST_UPDATED = 1;");
    expect(Object.keys(publicFiles)).toHaveLength(PUBLIC_NAMES.length + 1);
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
