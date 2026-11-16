import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadMetaShare } from "../deck-payload";

const okResponse = (body: unknown) =>
  ({ ok: true, json: () => Promise.resolve(body) }) as unknown as Response;

const entry = (overrides: Record<string, unknown> = {}) => ({
  name: "venusaur-a1-004",
  share: 0.2,
  windowGames: 90,
  sharePrev: 0.1,
  delta: 0.1,
  firstSeen: "2026-10-01",
  isNew: false,
  ...overrides,
});

const shareFile = (decks: unknown[] = [entry()]) => ({
  generatedAt: "2026-11-01T00:00:00Z",
  windowDays: 20,
  decks,
});

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, "fetch");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("loadMetaShare", () => {
  it("returns a well-formed share file", async () => {
    fetchSpy.mockResolvedValue(okResponse(shareFile()));

    await expect(loadMetaShare("20d", "public")).resolves.toEqual(shareFile());
  });

  it("accepts entries that only carry the share fields", async () => {
    const bare = { name: "a", share: 0.1, windowGames: 9 };
    fetchSpy.mockResolvedValue(okResponse(shareFile([bare])));

    await expect(loadMetaShare("20d", "public")).resolves.toEqual(shareFile([bare]));
  });

  it("rejects a failed fetch instead of returning null", async () => {
    fetchSpy.mockResolvedValue({ ok: false, status: 404, statusText: "Not Found" } as Response);

    await expect(loadMetaShare("20d", "public")).rejects.toThrow(/meta-share\.json/);
  });

  it("rejects a network failure instead of returning null", async () => {
    fetchSpy.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(loadMetaShare("20d", "public")).rejects.toThrow("Failed to fetch");
  });

  it("rejects a file without a decks array", async () => {
    fetchSpy.mockResolvedValue(okResponse({ generatedAt: "2026-11-01T00:00:00Z", windowDays: 20 }));

    await expect(loadMetaShare("20d", "public")).rejects.toThrow(/unexpected shape/);
  });

  it.each([
    ["a non-numeric share", { share: "0.2" }],
    ["a missing name", { name: undefined }],
    ["a non-finite windowGames", { windowGames: Number.NaN }],
    ["a non-boolean isNew", { isNew: "yes" }],
    ["a non-string firstSeen", { firstSeen: 20261001 }],
  ])("rejects a file with %s in one entry", async (_label, override) => {
    fetchSpy.mockResolvedValue(okResponse(shareFile([entry(), entry(override)])));

    await expect(loadMetaShare("20d", "public")).rejects.toThrow(/unexpected shape/);
  });
});
