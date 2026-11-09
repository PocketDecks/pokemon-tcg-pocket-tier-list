import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  PREMIUM_ARTEFACT_NAMES,
  PREMIUM_DIR,
  PREMIUM_WINDOWS,
  loadPremiumSnapshotForVersion,
  premiumFilePath,
  premiumVersion,
  previousPremiumDir,
  renderDataVersion,
  splitArtefactFiles,
  snapshotPremiumVersion,
} from "../utils/premium-artefacts";
import * as premiumArtefacts from "../utils/premium-artefacts";

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
    expect(premiumVersion({ a: "b\nc" })).not.toBe(premiumVersion({ "a\nb": "c" }));
  });

  it("frames names and payloads independently", () => {
    expect(premiumVersion({ a: "b\n1:c" })).not.toBe(premiumVersion({ "a\n5:b": "c" }));
    expect(premiumVersion({ a: "x\n1:b\ny" })).not.toBe(
      premiumVersion({ a: "x", b: "y" })
    );
  });

  it("counts UTF-8 bytes when framing names and payloads", () => {
    expect(premiumVersion({ "é": "🐛" })).toBe("35f719d53af5daef");
  });
});

describe("versioned premium snapshots", () => {
  it("reads only a snapshot whose files hash to the referenced version", () => {
    const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "premium-version-snapshot-")), "premium");
    const files = Object.fromEntries(PREMIUM_ARTEFACT_NAMES.map((name) => [name, `payload:${name}`]));
    const version = premiumVersion(files);
    snapshotPremiumVersion(files, version, dir);
    expect(loadPremiumSnapshotForVersion(version, dir)).toEqual(files);
    fs.writeFileSync(path.join(dir, "..", "premium-previous", version, `${PREMIUM_ARTEFACT_NAMES[0]}.json`), "tampered");
    expect(loadPremiumSnapshotForVersion(version, dir)).toBeUndefined();
    expect(loadPremiumSnapshotForVersion("0000000000000000", dir)).toBeUndefined();
  });

  it("prunes only unprotected version directories inside the snapshot cache", () => {
    const prune = (premiumArtefacts as unknown as {
      prunePremiumSnapshots?: (versions: readonly string[], dir: string) => void;
    }).prunePremiumSnapshots;
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "premium-snapshot-cleanup-"));
    const dir = path.join(temp, "premium");
    const cache = previousPremiumDir(dir);
    const retained = ["aaaaaaaaaaaaaaaa", "bbbbbbbbbbbbbbbb", "cccccccccccccccc", "dddddddddddddddd"];
    const old = "eeeeeeeeeeeeeeee";
    fs.mkdirSync(cache, { recursive: true });
    for (const version of [...retained, old]) fs.mkdirSync(path.join(cache, version));
    fs.mkdirSync(path.join(cache, "unknown-entry"));
    fs.writeFileSync(path.join(cache, "legacy-file.json"), "[]");
    const outside = path.join(temp, "outside");
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, "keep.json"), "[]");
    fs.symlinkSync(outside, path.join(cache, "ffffffffffffffff"), "junction");

    try {
      if (typeof prune !== "function") {
        expect(prune).toBeTypeOf("function");
        return;
      }
      prune(retained, dir);
      expect(retained.every((version) => fs.existsSync(path.join(cache, version)))).toBe(true);
      expect(fs.existsSync(path.join(cache, old))).toBe(false);
      expect(fs.existsSync(path.join(cache, "unknown-entry"))).toBe(true);
      expect(fs.readFileSync(path.join(cache, "legacy-file.json"), "utf8")).toBe("[]");
      expect(fs.existsSync(path.join(cache, "ffffffffffffffff"))).toBe(true);
      expect(fs.existsSync(path.join(outside, "keep.json"))).toBe(true);
    } finally {
      fs.rmSync(temp, { recursive: true, force: true });
    }
  });

  it("does not follow a linked snapshot cache root", () => {
    const prune = (premiumArtefacts as unknown as {
      prunePremiumSnapshots?: (versions: readonly string[], dir: string) => void;
    }).prunePremiumSnapshots;
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "premium-snapshot-root-link-"));
    const externalCache = path.join(temp, "external");
    const linkedDir = path.join(temp, "analysis", "premium");
    const linkedCache = previousPremiumDir(linkedDir);
    const protectedData = path.join(externalCache, "eeeeeeeeeeeeeeee");
    fs.mkdirSync(protectedData, { recursive: true });
    fs.writeFileSync(path.join(protectedData, "keep.json"), "[]");
    fs.mkdirSync(path.dirname(linkedCache), { recursive: true });
    fs.symlinkSync(externalCache, linkedCache, "junction");

    try {
      if (typeof prune !== "function") {
        expect(prune).toBeTypeOf("function");
        return;
      }
      prune([], linkedDir);
      expect(fs.existsSync(path.join(protectedData, "keep.json"))).toBe(true);
    } finally {
      fs.rmSync(temp, { recursive: true, force: true });
    }
  });

  it("does not follow a linked ancestor of the snapshot cache", () => {
    const prune = (premiumArtefacts as unknown as { prunePremiumSnapshots?: (versions: readonly string[], dir: string) => void }).prunePremiumSnapshots;
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "premium-snapshot-ancestor-link-"));
    const outside = path.join(temp, "external");
    const version = path.join(outside, "premium-previous", "eeeeeeeeeeeeeeee");
    const linkedOut = path.join(temp, "analysis", "out");
    fs.mkdirSync(version, { recursive: true });
    fs.writeFileSync(path.join(version, "keep.json"), "[]");
    fs.mkdirSync(path.dirname(linkedOut), { recursive: true });
    fs.symlinkSync(outside, linkedOut, "junction");
    try {
      if (typeof prune !== "function") { expect(prune).toBeTypeOf("function"); return; }
      expect(() => prune([], path.join(linkedOut, "premium"))).not.toThrow();
      expect(fs.existsSync(path.join(version, "keep.json"))).toBe(true);
    } finally { fs.rmSync(temp, { recursive: true, force: true }); }
  });

  it("reports snapshot listing failures with the cache path", () => {
    const prune = (premiumArtefacts as unknown as { prunePremiumSnapshots?: (versions: readonly string[], dir: string) => void }).prunePremiumSnapshots;
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "premium-snapshot-list-failure-"));
    const dir = path.join(temp, "premium");
    fs.mkdirSync(previousPremiumDir(dir), { recursive: true });
    const cache = previousPremiumDir(dir);
    const error = Object.assign(new Error("denied"), { code: "EACCES" });
    const spy = vi.spyOn(fs, "readdirSync").mockImplementationOnce(() => { throw error; });
    try {
      expect(() => prune!([], dir)).toThrow(cache);
    } finally {
      spy.mockRestore();
      fs.rmSync(temp, { recursive: true, force: true });
    }
  });
});

describe("renderDataVersion", () => {
  it("renders the premium version with a trailing newline", () => {
    expect(renderDataVersion("0123456789abcdef")).toBe('{ "premium": "0123456789abcdef" }\n');
  });
});
