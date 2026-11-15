import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { PipelineMatchupData, PipelinePartialDeck } from "../../../src/types/pipeline-data";
import { WindowMetaShare } from "../utils/build-meta-share";
import { WINDOW_IDS, WindowArtefacts, WindowId } from "../utils/build-window-artefacts";
import {
  PREMIUM_ARTEFACT_NAMES,
  PREMIUM_DIR,
  PREMIUM_WINDOWS,
  loadPremiumSnapshotForVersion,
  premiumFilePath,
  premiumVersion,
  prunePremiumSnapshots,
  previousPremiumDir,
  renderDataVersion,
  splitWindowArtefacts,
  snapshotPremiumVersion,
} from "../utils/premium-artefacts";

const DECKS = Array.from({ length: 12 }, (_, index) => `deck-${index}`);

const bestDecks = (reverse: boolean): PipelinePartialDeck[] =>
  DECKS.map((name, index) => ({
    name,
    powerScore: reverse ? index : 100 - index,
  })) as unknown as PipelinePartialDeck[];

const matchupData = (): PipelineMatchupData =>
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
  ) as unknown as PipelineMatchupData;

const metaShare = (window: string): WindowMetaShare =>
  ({
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
  }) as unknown as WindowMetaShare;

const DIR = "../public/data/";

const artefacts = (): Record<WindowId, WindowArtefacts> =>
  Object.fromEntries(
    WINDOW_IDS.map((window) => [
      window,
      {
        bestDecks: bestDecks(window === "10d"),
        matchupData: matchupData(),
        metaShare: metaShare(window),
      },
    ])
  ) as Record<WindowId, WindowArtefacts>;

const render = (value: unknown): string => JSON.stringify(value, null, 2);

const freeIn = (window: "10d" | "20d"): string[] =>
  window === "10d" ? DECKS.slice(2) : DECKS.slice(0, 10);

describe("premium artefact names", () => {
  it("lists the eight artefacts", () => {
    expect([...PREMIUM_ARTEFACT_NAMES].sort()).toEqual([
      "best-decks-30d",
      "best-decks-all",
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

describe("splitWindowArtefacts", () => {
  it("puts the eight full artefacts in the premium files", () => {
    const { premiumFiles } = splitWindowArtefacts(artefacts());

    expect(Object.keys(premiumFiles).sort()).toEqual([...PREMIUM_ARTEFACT_NAMES].sort());
  });

  it("keeps the 30d and all-time files out of the public files", () => {
    const { publicFiles } = splitWindowArtefacts(artefacts());

    expect(Object.keys(publicFiles).some((key) => /-(30d|all).json$/.test(key))).toBe(false);
  });

  it("carries the full 10d and 20d meta share and the 30d matchups into the premium files unchanged", () => {
    const input = artefacts();
    const { premiumFiles } = splitWindowArtefacts(input);

    expect(premiumFiles["meta-share-20d"]).toBe(render(input["20d"].metaShare));
    expect(premiumFiles).not.toHaveProperty("matchup-data-20d");
    expect(premiumFiles["meta-share-10d"]).toBe(render(input["10d"].metaShare));
    expect(premiumFiles["matchup-data-30d"]).toBe(render(input["30d"].matchupData));
  });

  it("leaves best-decks public and whole for 10d, 20d and the default", () => {
    const input = artefacts();
    const { publicFiles } = splitWindowArtefacts(input);

    expect(publicFiles[`${DIR}best-decks-10d.json`]).toBe(render(input["10d"].bestDecks));
    expect(publicFiles[`${DIR}best-decks-20d.json`]).toBe(render(input["20d"].bestDecks));
    expect(publicFiles[`${DIR}best-decks.json`]).toBe(render(input["20d"].bestDecks));
  });

  it("publishes every deck's matchup rows in the 10d and 20d files", () => {
    const input = artefacts();
    const firstDeck = Object.keys(input["10d"].matchupData)[0];
    (input["10d"].matchupData[firstDeck] as { winRate: number }[])[0].winRate = 0.61;
    const { publicFiles } = splitWindowArtefacts(input);

    expect(publicFiles[`${DIR}matchup-data-10d.json`]).toBe(render(input["10d"].matchupData));
    expect(publicFiles[`${DIR}matchup-data-20d.json`]).toBe(render(input["20d"].matchupData));
    expect(publicFiles[`${DIR}matchup-data-10d.json`]).not.toBe(publicFiles[`${DIR}matchup-data-20d.json`]);
  });

  it("trims the public meta share to name, share and window games for the other decks", () => {
    const { publicFiles } = splitWindowArtefacts(artefacts());
    const trimmed = JSON.parse(publicFiles[`${DIR}meta-share-20d.json`]);

    for (const entry of trimmed.decks) {
      if (freeIn("20d").includes(entry.name)) {
        expect(Object.keys(entry)).toContain("delta");
      } else {
        expect(Object.keys(entry)).toEqual(["name", "share", "windowGames"]);
      }
    }
  });

  it("chooses the free meta share decks from each window's own ranking", () => {
    const { publicFiles } = splitWindowArtefacts(artefacts());
    const tenDay = JSON.parse(publicFiles[`${DIR}meta-share-10d.json`]);
    const twentyDay = JSON.parse(publicFiles[`${DIR}meta-share-20d.json`]);
    const keys = (shared: { decks: { name: string }[] }, name: string) =>
      Object.keys(shared.decks.find((entry) => entry.name === name) ?? {});

    expect(keys(tenDay, "deck-0")).toEqual(["name", "share", "windowGames"]);
    expect(keys(twentyDay, "deck-0")).toContain("delta");
    expect(keys(tenDay, "deck-11")).toContain("delta");
    expect(keys(twentyDay, "deck-11")).toEqual(["name", "share", "windowGames"]);
  });

  it("writes un-suffixed files that match the default window", () => {
    const { publicFiles } = splitWindowArtefacts(artefacts());

    for (const base of ["best-decks", "matchup-data", "meta-share"]) {
      expect(publicFiles[`${DIR}${base}.json`]).toBe(publicFiles[`${DIR}${base}-20d.json`]);
    }
  });

  it("writes a suffixed public file for the 10d and 20d windows and no others", () => {
    const { publicFiles } = splitWindowArtefacts(artefacts());

    expect(Object.keys(publicFiles)).toHaveLength(9);
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
      prunePremiumSnapshots(retained, dir);
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
      prunePremiumSnapshots([], linkedDir);
      expect(fs.existsSync(path.join(protectedData, "keep.json"))).toBe(true);
    } finally {
      fs.rmSync(temp, { recursive: true, force: true });
    }
  });

  it("does not follow a linked ancestor of the snapshot cache", () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "premium-snapshot-ancestor-link-"));
    const outside = path.join(temp, "external");
    const version = path.join(outside, "premium-previous", "eeeeeeeeeeeeeeee");
    const linkedOut = path.join(temp, "analysis", "out");
    fs.mkdirSync(version, { recursive: true });
    fs.writeFileSync(path.join(version, "keep.json"), "[]");
    fs.mkdirSync(path.dirname(linkedOut), { recursive: true });
    fs.symlinkSync(outside, linkedOut, "junction");
    try {
      expect(() => prunePremiumSnapshots([], path.join(linkedOut, "premium"))).not.toThrow();
      expect(fs.existsSync(path.join(version, "keep.json"))).toBe(true);
    } finally { fs.rmSync(temp, { recursive: true, force: true }); }
  });

  it("reports snapshot listing failures with the cache path", () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "premium-snapshot-list-failure-"));
    const dir = path.join(temp, "premium");
    fs.mkdirSync(previousPremiumDir(dir), { recursive: true });
    const cache = previousPremiumDir(dir);
    const error = Object.assign(new Error("denied"), { code: "EACCES" });
    const spy = vi.spyOn(fs, "readdirSync").mockImplementationOnce(() => { throw error; });
    try {
      expect(() => prunePremiumSnapshots([], dir)).toThrow(cache);
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
