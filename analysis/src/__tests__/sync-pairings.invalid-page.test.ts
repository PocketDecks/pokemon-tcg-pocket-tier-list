import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { exitCodeFor, main } from "../../scripts/sync-pairings";
import { readStore } from "../utils/deck-listing-store";

vi.mock("../load-env-side-effect", () => ({}));

const NOTICE = "<html><title>Service notice</title><p>Try again later</p></html>";

const row = (slug: string, name: string, count: number) =>
  `<tr><td>1</td><td></td><td><a href="/decks/${slug}?game=pocket&set=B4a">${name}</a></td>` +
  `<td>${count}</td><td>5%</td></tr>`;

const page = (set: string, rows: string) =>
  `<html><head><title>Decks - ${set} - Pokémon TCG Pocket | Limitless</title></head>` +
  `<body><table>${rows}</table></body></html>`;

const seed = {
  updatedAt: "2026-10-01T00:00:00.000Z",
  currentSet: "B4a",
  sets: {
    A1: {
      decks: [{ name: "Charizard ex", slug: "charizard-ex-a1-036", count: 900 }],
    },
    B4a: {
      decks: [{ name: "Mew ex", slug: "mew-ex-a1-129", count: 100 }],
    },
  },
};

const fetchFor = (bodies: Record<string, string>): typeof fetch =>
  (async (input: string) => {
    const set = new URL(input).searchParams.get("set") ?? "";
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      text: async () => bodies[set] ?? NOTICE,
    };
  }) as unknown as typeof fetch;

describe("sync-pairings set page validation", () => {
  let storePath: string;
  let logs: string[];

  beforeEach(() => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sync-pairings-"));
    storePath = path.join(dir, "limitless-decks.json");
    fs.writeFileSync(storePath, `${JSON.stringify(seed, null, 2)}\n`);
    logs = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.join(" "));
    });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(path.dirname(storePath), { recursive: true, force: true });
  });

  const written = () => readStore(fs.readFileSync(storePath, "utf8"));

  it("keeps a set's snapshot when the page is a service notice", async () => {
    const state = await main({
      storePath,
      fetchImpl: fetchFor({ B4a: page("B4a", row("mew-ex-a1-129", "Mew ex", 140)) }),
      sets: ["A1", "B4a"],
    });

    expect(state.failures).toBe(1);
    expect(state.fetchedSets).toBe(1);
    expect(exitCodeFor(state)).toBe(1);
    expect(written().sets.A1).toEqual(seed.sets.A1);
    expect(written().sets.B4a.decks).toEqual([
      { name: "Mew ex", slug: "mew-ex-a1-129", count: 140 },
    ]);
    expect(logs.join("\n")).toContain("A1: Limitless A1 page held no deck rows");
  });

  it("keeps a set's snapshot when the page is truncated", async () => {
    const truncated =
      `<html><head><title>Decks - A1 - Pokémon TCG Pocket | Limitless</title></head>` +
      `<body><table>${row("mew-ex-a1-129", "Mew ex", 12)}`;

    const state = await main({
      storePath,
      fetchImpl: fetchFor({
        A1: truncated,
        B4a: page("B4a", row("mew-ex-a1-129", "Mew ex", 140)),
      }),
      sets: ["A1", "B4a"],
    });

    expect(state.failures).toBe(1);
    expect(written().sets.A1).toEqual(seed.sets.A1);
    expect(logs.join("\n")).toContain("A1: Limitless A1 page was truncated");
  });

  it("keeps a set's snapshot when the page names another set", async () => {
    const state = await main({
      storePath,
      fetchImpl: fetchFor({
        A1: page("A2", row("mew-ex-a1-129", "Mew ex", 12)),
        B4a: page("B4a", row("mew-ex-a1-129", "Mew ex", 140)),
      }),
      sets: ["A1", "B4a"],
    });

    expect(state.failures).toBe(1);
    expect(written().sets.A1).toEqual(seed.sets.A1);
    expect(logs.join("\n")).toContain("A1: Limitless A1 page named A2");
  });

  it("leaves no staging files beside the store", async () => {
    await main({
      storePath,
      fetchImpl: fetchFor({ B4a: page("B4a", row("mew-ex-a1-129", "Mew ex", 140)) }),
      sets: ["B4a"],
    });

    expect(fs.readdirSync(path.dirname(storePath))).toEqual([
      "limitless-decks.json",
    ]);
  });

  it("leaves the store untouched when every page fails", async () => {
    const before = fs.readFileSync(storePath, "utf8");

    const state = await main({
      storePath,
      fetchImpl: fetchFor({}),
      sets: ["A1", "B4a"],
    });

    expect(state.fetchedSets).toBe(0);
    expect(state.failures).toBe(2);
    expect(exitCodeFor(state)).toBe(1);
    expect(fs.readFileSync(storePath, "utf8")).toBe(before);
  });
});
