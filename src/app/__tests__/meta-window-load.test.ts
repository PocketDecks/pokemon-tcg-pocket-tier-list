import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const spies = vi.hoisted(() => ({
  firestoreImported: vi.fn(),
  loadPremiumArtefact: vi.fn(),
}));

vi.mock("firebase/firestore", () => {
  spies.firestoreImported();
  return {};
});

vi.mock("../premium-data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../premium-data")>();
  return { ...actual, loadPremiumArtefact: spies.loadPremiumArtefact };
});

import { loadTieredArtefact, loadWindowArtefact } from "../meta-window";
import { PremiumAccessError } from "../premium-data";

const okResponse = (body: unknown) =>
  ({ ok: true, json: () => Promise.resolve(body) }) as unknown as Response;

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(okResponse([{ name: "public" }]));
  spies.loadPremiumArtefact.mockResolvedValue([{ name: "premium" }]);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("loadWindowArtefact", () => {
  it("fetches the un-suffixed file for the default window without touching Firestore", async () => {
    await expect(loadWindowArtefact("best-decks", "20d")).resolves.toEqual([{ name: "public" }]);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith("/data/best-decks.json");
    expect(spies.firestoreImported).not.toHaveBeenCalled();
    expect(spies.loadPremiumArtefact).not.toHaveBeenCalled();
  });

  it("fetches the suffixed file for the 10-day window without touching Firestore", async () => {
    await loadWindowArtefact("meta-share", "10d");

    expect(fetchSpy).toHaveBeenCalledWith("/data/meta-share-10d.json");
    expect(spies.firestoreImported).not.toHaveBeenCalled();
    expect(spies.loadPremiumArtefact).not.toHaveBeenCalled();
  });

  it.each(["30d", "all"] as const)(
    "reads the %s window through the premium loader and never fetches its public file",
    async (window) => {
      await expect(loadWindowArtefact("best-decks", window)).resolves.toEqual([{ name: "premium" }]);

      expect(spies.loadPremiumArtefact).toHaveBeenCalledWith(`best-decks-${window}`);
      expect(fetchSpy).not.toHaveBeenCalled();
    }
  );

  it("reports the status of a failed public fetch by file name", async () => {
    fetchSpy.mockResolvedValue({ ok: false, status: 500, statusText: "Internal Server Error" } as Response);

    await expect(loadWindowArtefact("matchup-data", "20d")).rejects.toThrow(
      "Failed to fetch matchup-data.json: 500 Internal Server Error"
    );
  });
});

describe("loadTieredArtefact", () => {
  it("reads the public file for the public tier in a default window", async () => {
    await expect(loadTieredArtefact("matchup-data", "20d", "public")).resolves.toEqual([
      { name: "public" },
    ]);

    expect(fetchSpy).toHaveBeenCalledWith("/data/matchup-data.json");
    expect(spies.loadPremiumArtefact).not.toHaveBeenCalled();
  });

  it.each(["10d", "20d"] as const)(
    "reads the full %s artefact through the premium loader for the full tier",
    async (window) => {
      await expect(loadTieredArtefact("meta-share", window, "full")).resolves.toEqual([
        { name: "premium" },
      ]);

      expect(spies.loadPremiumArtefact).toHaveBeenCalledWith(`meta-share-${window}`);
      expect(fetchSpy).not.toHaveBeenCalled();
    }
  );

  it("falls back to the public file when the full artefact of a default window is denied", async () => {
    spies.loadPremiumArtefact.mockRejectedValue(new PremiumAccessError("matchup-data-10d"));

    await expect(loadTieredArtefact("matchup-data", "10d", "full")).resolves.toEqual([
      { name: "public" },
    ]);

    expect(fetchSpy).toHaveBeenCalledWith("/data/matchup-data-10d.json");
  });

  it("does not hide other failures behind the public file", async () => {
    const failure = new Error("offline");
    spies.loadPremiumArtefact.mockRejectedValue(failure);

    await expect(loadTieredArtefact("matchup-data", "20d", "full")).rejects.toBe(failure);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each(["30d", "all"] as const)(
    "keeps the denial of a premium window, which has no public file",
    async (window) => {
      const denied = new PremiumAccessError(`meta-share-${window}`);
      spies.loadPremiumArtefact.mockRejectedValue(denied);

      await expect(loadTieredArtefact("meta-share", window, "full")).rejects.toBe(denied);

      expect(fetchSpy).not.toHaveBeenCalled();
    }
  );
});
