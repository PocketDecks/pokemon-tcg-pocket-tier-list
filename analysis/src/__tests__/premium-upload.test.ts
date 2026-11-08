import { describe, expect, it } from "vitest";

import {
  PREMIUM_ARTEFACT_NAMES,
  sha256Hex,
} from "../utils/premium-artefacts";
import { checkPremiumVersion, type PremiumSnapshot } from "../utils/premium-verify";
import { planPremiumUpload } from "../utils/premium-upload";

const files = (): Record<string, string> =>
  Object.fromEntries(PREMIUM_ARTEFACT_NAMES.map((name) => [name, `{"name":"${name}"}`]));

const versions = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    version: `v${index}`,
    createdAt: 1000 + index,
  }));

describe("planPremiumUpload", () => {
  it("plans one document per artefact and a version document that lists every hash", () => {
    const plan = planPremiumUpload({ files: files(), version: "abc", existing: [] });

    expect(plan.artefactWrites).toHaveLength(10);
    const write = plan.artefactWrites.find((entry) => entry.path === "premiumData/abc/artefacts/best-decks-30d");
    expect(write?.data).toEqual({
      payload: '{"name":"best-decks-30d"}',
      sha256: sha256Hex('{"name":"best-decks-30d"}'),
    });
    expect(plan.versionWrite.path).toBe("premiumData/abc");
    expect(Object.keys(plan.versionWrite.data.artefacts).sort()).toEqual(
      [...PREMIUM_ARTEFACT_NAMES].sort()
    );
    expect(plan.versionWrite.data.artefacts["best-decks-30d"]).toBe(
      sha256Hex('{"name":"best-decks-30d"}')
    );
    expect(plan.deleteVersions).toEqual([]);
  });

  it("throws when any payload exceeds the byte limit", () => {
    const big = { ...files(), "matchup-data-all": "x".repeat(901) };

    expect(() =>
      planPremiumUpload({ files: big, version: "abc", existing: [], maxBytes: 900 })
    ).toThrow(/matchup-data-all.*901.*900/);
  });

  it("counts bytes rather than characters", () => {
    const wide = { ...files(), "matchup-data-all": "é".repeat(500) };

    expect(() =>
      planPremiumUpload({ files: wide, version: "abc", existing: [], maxBytes: 900 })
    ).toThrow(/matchup-data-all/);
  });

  it("keeps five versions in total and deletes the oldest beyond that", () => {
    const plan = planPremiumUpload({ files: files(), version: "new", existing: versions(6) });

    expect(plan.deleteVersions).toEqual(["v0", "v1"]);
  });

  it("deletes nothing while there are five or fewer versions including the new one", () => {
    const plan = planPremiumUpload({ files: files(), version: "new", existing: versions(4) });

    expect(plan.deleteVersions).toEqual([]);
  });

  it("never deletes the new version even when it is the oldest", () => {
    const existing = [...versions(6), { version: "new", createdAt: 1 }];

    const plan = planPremiumUpload({ files: files(), version: "new", existing });

    expect(plan.deleteVersions).not.toContain("new");
    expect(plan.deleteVersions).toEqual(["v0", "v1"]);
  });

  it("honours a custom keep count", () => {
    const plan = planPremiumUpload({ files: files(), version: "new", existing: versions(3), keep: 2 });

    expect(plan.deleteVersions).toEqual(["v0", "v1"]);
  });
});

const completeSnapshot = (): PremiumSnapshot => {
  const payloads = files();
  return {
    version: premiumVersion(files()),
    versionDocument: {
      artefacts: Object.fromEntries(
        Object.entries(payloads).map(([name, payload]) => [name, sha256Hex(payload)])
      ),
    },
    artefacts: Object.fromEntries(
      Object.entries(payloads).map(([name, payload]) => [
        name,
        { payload, sha256: sha256Hex(payload) },
      ])
    ),
  };
};

describe("checkPremiumVersion", () => {
  it("passes on a complete set", () => {
    expect(checkPremiumVersion(completeSnapshot())).toEqual([]);
  });

  it("fails on a missing version document", () => {
    const snapshot = { ...completeSnapshot(), versionDocument: null };

    expect(checkPremiumVersion(snapshot)).toEqual([
      `version ${completeSnapshot().version} is missing`,
    ]);
  });

  it("fails on a missing artefact", () => {
    const snapshot = completeSnapshot();
    snapshot.artefacts["meta-share-all"] = null;

    expect(checkPremiumVersion(snapshot)).toEqual(["artefact meta-share-all is missing"]);
  });

  it("fails when the stored payload no longer matches its stored hash", () => {
    const snapshot = completeSnapshot();
    snapshot.artefacts["best-decks-all"] = {
      payload: "tampered",
      sha256: sha256Hex('{"name":"best-decks-all"}'),
    };

    const problems = checkPremiumVersion(snapshot);
    expect(problems).toContain("artefact best-decks-all hash mismatch");
  });

  it("fails when the version document lists a different hash from the artefact", () => {
    const snapshot = completeSnapshot();
    snapshot.versionDocument = {
      artefacts: { ...snapshot.versionDocument!.artefacts, "best-decks-30d": "0".repeat(64) },
    };

    expect(checkPremiumVersion(snapshot)).toEqual(["artefact best-decks-30d hash mismatch"]);
  });
});

import { premiumVersion } from "../utils/premium-artefacts";

describe("checkPremiumVersion version recompute", () => {
  it("fails when the version does not match the payloads", () => {
    const snapshot = completeSnapshot();
    const expected = premiumVersion(files());

    const renamed = { ...snapshot, version: expected };
    expect(checkPremiumVersion(renamed)).toEqual([]);
    expect(checkPremiumVersion(snapshot)).toEqual([]);
  });
});
