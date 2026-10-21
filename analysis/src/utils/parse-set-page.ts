import { DeckListing } from "./deck-listing-store";

export interface ParsedSetPage {
  decks: DeckListing[];
  unreadableCounts: number;
}

const ROW =
  /<tr[^>]*>.*?<a href="\/decks\/([a-z0-9-]+)\?[^"]*"[^>]*>([^<]+)<\/a>.*?<\/tr>/gs;

const COUNT_CELL_INDEX = 3;

const decksUrl = (set: string): string =>
  `https://play.limitlesstcg.com/decks?game=pocket&set=${set}`;

const readCount = (row: string): number | null => {
  const cells = [...row.matchAll(/<td[^>]*>(.*?)<\/td>/gs)];
  const cell = cells[COUNT_CELL_INDEX]?.[1] ?? "";
  const digits = cell.replace(/<[^>]+>/g, "").replace(/,/g, "").trim();
  const value = Number(digits);
  return digits !== "" && Number.isFinite(value) ? value : null;
};

export const parseSetPage = (html: string): ParsedSetPage => {
  const decks: DeckListing[] = [];
  const seen = new Set<string>();
  let unreadableCounts = 0;
  for (const match of html.matchAll(ROW)) {
    const [row, slug, name] = match;
    if (seen.has(slug)) continue;
    seen.add(slug);
    const count = readCount(row);
    if (count === null) unreadableCounts += 1;
    decks.push({ name: name.trim(), slug, count: count ?? 0 });
  }
  return { decks, unreadableCounts };
};

export const assertUsablePage = (set: string, page: ParsedSetPage): void => {
  if (page.decks.length === 0) {
    throw new Error(`Limitless ${set} page held no deck rows`);
  }
  if (page.unreadableCounts === page.decks.length) {
    throw new Error(`Limitless ${set} page had no readable counts`);
  }
  if (page.unreadableCounts > 0) {
    throw new Error(`Limitless ${set} page had an unreadable count`);
  }
};

const TITLE = /<title>Decks - ([A-Za-z0-9]+) - /;

// A page that parsed can still be the wrong one: a truncated body stops after
// some rows, and a cached or misrouted response names another set. Both would
// otherwise replace a set's snapshot with a partial or foreign one.
export const assertSetPage = (set: string, html: string): void => {
  if (!html.includes("</table>")) {
    throw new Error(`Limitless ${set} page was truncated`);
  }
  const named = TITLE.exec(html)?.[1];
  if (!named) {
    throw new Error(`Limitless ${set} page had no set title`);
  }
  if (named.toLowerCase() !== set.toLowerCase()) {
    throw new Error(`Limitless ${set} page named ${named}`);
  }
};

export const fetchSetPage = async (
  set: string,
  fetchImpl: typeof fetch = fetch
): Promise<ParsedSetPage> => {
  const res = await fetchImpl(decksUrl(set), { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Limitless ${set} returned ${res.status} ${res.statusText}`);
  const html = await res.text();
  const page = parseSetPage(html);
  assertUsablePage(set, page);
  assertSetPage(set, html);
  return page;
};
