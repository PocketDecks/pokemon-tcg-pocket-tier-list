import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ANCHOR_MOBILE_MAX_WIDTH, ANCHOR_RESERVE_MOBILE } from "../adsConfig";

const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");

describe("template anchor reservation", () => {
  it("reserves the mobile anchor height before the app mounts, only when no consent banner is pending", () => {
    const rule = new RegExp(
      String.raw`@media \(max-width: ${ANCHOR_MOBILE_MAX_WIDTH}px\)\s*\{\s*` +
        String.raw`:root:not\(\[data-consent-pending\]\)\s*\{\s*` +
        String.raw`--ad-anchor-h: ${ANCHOR_RESERVE_MOBILE}px;\s*\}\s*\}`
    );

    expect(html).toMatch(rule);
  });
});
