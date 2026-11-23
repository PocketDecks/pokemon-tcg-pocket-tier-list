import { describe, expect, it } from "vitest";

import {
  AUTOMATION_AUTHOR,
  REFRESH_SUBJECT,
  buildPrBody,
  findCanonicalRemote,
  humanCommits,
  isSilentDay,
  needsPersonForRefusal,
  storeLockRetry,
} from "../../scripts/refresh-job";

describe("refresh job decisions", () => {
  it("finds the canonical remote by its GitHub URL rather than its alias", () => {
    const remotes = [
      "origin\thttps://github.com/chase-mew/pokemon-tcg-pocket-tier-list.git (fetch)",
      "origin\thttps://github.com/chase-mew/pokemon-tcg-pocket-tier-list.git (push)",
      "pocket\thttps://github.com/PocketDecks/pokemon-tcg-pocket-tier-list.git (fetch)",
      "pocket\thttps://github.com/PocketDecks/pokemon-tcg-pocket-tier-list.git (push)",
    ].join("\n");
    expect(findCanonicalRemote(remotes)).toBe("pocket");
    expect(findCanonicalRemote(remotes.split("\n").slice(0, 2).join("\n"))).toBeNull();
  });

  it("keeps human commits and drops the automation snapshot commit", () => {
    const log = [
      "aaa1111 Jane Doe Add a feature",
      `bbb2222 ${AUTOMATION_AUTHOR} ${REFRESH_SUBJECT}`,
      "ccc3333 John Smith Fix a deck row",
    ].join("\n");
    expect(humanCommits(log)).toEqual([
      "aaa1111 Jane Doe Add a feature",
      "ccc3333 John Smith Fix a deck row",
    ]);
  });

  it("treats an empty classifier result as a silent day", () => {
    expect(isSilentDay("  \n\t\n")).toBe(true);
    expect(isSilentDay("analysis/src/data/limitless-decks.json\n")).toBe(false);
  });

  it("builds a fixed pull request body from the supplied values", () => {
    const body = buildPrBody({
      pairingRows: 42,
      rankedArchetypes: 17,
      imageParity: "matched",
      testResults: "all checks passed",
      premiumVersion: "0f6b2a3345ae2e53",
    });
    expect(body).toBe(
      [
        "Pairing rows: 42",
        "Ranked archetypes: 17",
        "Image parity: matched",
        "Test results: all checks passed",
        "Premium version: 0f6b2a3345ae2e53",
      ].join("\n")
    );
  });

  it("distinguishes a retryable lock refusal from a manual lock repair", () => {
    expect(storeLockRetry("The store lock is busy; retry in a few seconds")).toBe(true);
    expect(needsPersonForRefusal("The claim pid has been reused; remove the claim by hand")).toBe(true);
    expect(needsPersonForRefusal("download failed with a network error")).toBe(false);
  });
});
