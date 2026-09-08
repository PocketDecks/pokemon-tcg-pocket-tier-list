// Copyright (c) 2025-2026, Pokemon TCG Pocket Tier List contributors
// AGPL-3.0-or-later (https://www.gnu.org/licenses/gpl-3.0.html)

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runScrape } from "../sync-pairings.mjs";

const ONE_ROW_HTML = `<!DOCTYPE html><html><body><table>
<tr data-share="50"><a href="/decks/mock-primary-a1-001?game=pocket">Mock Primary A1 001</a></tr>
</table></body></html>`;

describe("runScrape seed parity", () => {
  it("seeds the three archetypes before and after a scrape with one non-seeded row", async () => {
    const fetchSet = async () => [
      {
        name: "Charizard ex A1 36",
        slug: "charizard-ex-a1-036",
        set: "A1",
        count: 123,
        share: 50,
      },
    ];

    const { store } = await runScrape(["A1"], fetchSet);

    // The three seeded archetypes must exist.
    for (const key of [
      "Oricorio A3 66",
      "Puppy-Loving Girl B3b 67",
      "Gigalith ex A2 94",
    ]) {
      assert.ok(
        key in store.pairings,
        `seeded primary ${key} missing from store.pairings`
      );
      assert.ok(
        Array.isArray(store.pairings[key].secondary),
        `${key} secondary must be an array`
      );
      assert.ok(
        store.pairings[key].secondary.length === 0,
        `${key} must have no partners`
      );
    }

    // The scraped primary must also exist.
    assert.ok(
      "Charizard ex A1 36" in store.pairings,
      "scraped primary missing from store.pairings"
    );
  });
});
