import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { deckSlug } from "../../../src/app/deck-slug";

const publicData = path.join(__dirname, "../../../public/data");

const publishedNames = (): string[] =>
  fs
    .readdirSync(publicData)
    .filter((file) => /^best-decks.*\.json$/.test(file))
    .flatMap((file) =>
      (JSON.parse(fs.readFileSync(path.join(publicData, file), "utf8")) as { name: string }[]).map(
        (deck) => deck.name
      )
    );

describe("OG image slugs", () => {
  it("keep the lowercase, hyphen-for-whitespace form for every published deck name", () => {
    const names = publishedNames();

    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      expect(deckSlug(name)).toBe(name.toLowerCase().replace(/\s/g, "-"));
    }
  });
});
