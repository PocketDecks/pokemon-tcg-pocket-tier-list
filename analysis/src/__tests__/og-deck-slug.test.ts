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

// deckSlug drops punctuation such as the apostrophe in "Team Rocket's", so a
// slug can differ from its name. What every published name must still give is
// a lowercase, hyphenated slug that is safe in a URL and a file name.
const URL_SAFE_SLUG = /^[a-z0-9&]+(-[a-z0-9&]+)*$/;

describe("OG image slugs", () => {
  it("are lowercase, hyphenated and URL-safe for every published deck name", () => {
    const names = publishedNames();

    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      expect(deckSlug(name)).toMatch(URL_SAFE_SLUG);
    }
  });

  it("drop the apostrophe from a Team Rocket's deck name", () => {
    expect(deckSlug("team-rocket's-electrode-b4a-020&dedenne-ex-b3b-024")).toBe(
      "team-rockets-electrode-b4a-020&dedenne-ex-b3b-024"
    );
  });
});
