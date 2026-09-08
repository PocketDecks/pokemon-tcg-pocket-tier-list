// Copyright (c) 2025-2026, Pokemon TCG Pocket Tier List contributors
// AGPL-3.0-or-later (https://www.gnu.org/licenses/gpl-3.0.html)

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runScrape } from "../sync-pairings.mjs";

const ZERO_ROW_HTML = `<!DOCTYPE html><html><body><table>
<tr><td colspan="3">No decks found</td></tr>
</table></body></html>`;

describe("runScrape", () => {
  it("throws when every page returns OK but parses zero rows", async () => {
    const fetchSet = async () => {
      return [];
    };

    await assert.rejects(
      () => runScrape(["A1"], fetchSet),
      (err) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /markup/i);
        return true;
      },
    );
  });
});
