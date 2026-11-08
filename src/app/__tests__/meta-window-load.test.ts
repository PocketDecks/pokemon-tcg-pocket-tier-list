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

import { loadWindowArtefact } from "../meta-window";

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
