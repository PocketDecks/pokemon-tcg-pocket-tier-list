import { vi } from "vitest";
import { assertUsablePage, fetchSetPage, parseSetPage } from "../utils/parse-set-page";

const row = (slug: string, name: string, count: string) =>
  `<tr><td>1</td><td></td><td><a href="/decks/${slug}?game=pocket&set=B4a">${name}</a></td><td>${count}</td><td>5%</td><td>1-1</td><td>50%</td></tr>`;

const respond = (body: string, ok = true) =>
  vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 503,
    statusText: ok ? "OK" : "Service Unavailable",
    text: async () => body,
  }) as unknown as typeof fetch;

describe("parseSetPage", () => {
  it("reads slug, trimmed name and a comma-separated count", () => {
    const page = parseSetPage(`<table>${row("charizard-ex-a1-036", " Charizard ex ", "1,234")}</table>`);
    expect(page).toEqual({
      decks: [{ name: "Charizard ex", slug: "charizard-ex-a1-036", count: 1234 }],
      unreadableCounts: 0,
    });
  });

  it("keeps the first row for a repeated slug", () => {
    const html = row("mew-ex-a1-129", "Mew ex", "10") + row("mew-ex-a1-129", "Mew ex", "99");
    expect(parseSetPage(html).decks).toEqual([{ name: "Mew ex", slug: "mew-ex-a1-129", count: 10 }]);
  });

  it("stores an unreadable count as 0 and reports it", () => {
    const page = parseSetPage(row("mew-ex-a1-129", "Mew ex", "n/a"));
    expect(page.decks[0].count).toBe(0);
    expect(page.unreadableCounts).toBe(1);
  });

  it("returns nothing for a page without deck rows", () => {
    expect(parseSetPage("<html>Just a moment...</html>")).toEqual({ decks: [], unreadableCounts: 0 });
  });
});

describe("assertUsablePage", () => {
  it("rejects a page with no rows", () => {
    expect(() => assertUsablePage("B4a", { decks: [], unreadableCounts: 0 })).toThrow(
      "Limitless B4a page held no deck rows"
    );
  });

  it("rejects a page where no count could be read", () => {
    const decks = [{ name: "A", slug: "a-a1-001", count: 0 }];
    expect(() => assertUsablePage("B4a", { decks, unreadableCounts: 1 })).toThrow("no readable counts");
  });

  it("accepts a page with some unreadable counts", () => {
    const decks = [
      { name: "A", slug: "a-a1-001", count: 5 },
      { name: "B", slug: "b-a1-002", count: 0 },
    ];
    expect(() => assertUsablePage("B4a", { decks, unreadableCounts: 1 })).not.toThrow();
  });
});

describe("fetchSetPage", () => {
  it("requests the set's deck page", async () => {
    const fetchImpl = respond(row("mew-ex-a1-129", "Mew ex", "10"));
    await fetchSetPage("B4a", fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://play.limitlesstcg.com/decks?game=pocket&set=B4a",
      expect.anything()
    );
  });

  it("returns the parsed rows", async () => {
    const page = await fetchSetPage("B4a", respond(row("mew-ex-a1-129", "Mew ex", "10")));
    expect(page.decks).toHaveLength(1);
  });

  it("rejects an HTTP error", async () => {
    await expect(fetchSetPage("B4a", respond("", false))).rejects.toThrow("returned 503");
  });

  it("rejects a challenge page instead of returning an empty snapshot", async () => {
    await expect(fetchSetPage("B4a", respond("<html>Just a moment...</html>"))).rejects.toThrow(
      "page held no deck rows"
    );
  });
});
