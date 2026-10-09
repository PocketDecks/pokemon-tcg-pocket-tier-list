import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ANCHOR_MOBILE_MAX_WIDTH, ANCHOR_RESERVE_MOBILE } from "../adsConfig";

const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");

describe("template anchor reservation", () => {
  it("reserves the mobile anchor height before the app mounts", () => {
    expect(html).toContain(`--ad-anchor-h: ${ANCHOR_RESERVE_MOBILE}px;`);
  });

  it("applies only at the anchor's mobile breakpoint", () => {
    expect(html).toContain(`@media (max-width: ${ANCHOR_MOBILE_MAX_WIDTH}px)`);
  });

  it("skips the reservation while a consent banner is pending", () => {
    expect(html).toContain(":root:not([data-consent-pending])");
  });
});
