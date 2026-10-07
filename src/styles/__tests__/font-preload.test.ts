import { describe, expect, it } from "vitest";
import { replaceManropePreload } from "../../../scripts/manrope-preload.mjs";

describe("built font preload", () => {
  it("replaces the placeholder with the emitted latin Manrope file", () => {
    const html = replaceManropePreload(
      '<link rel="preload" href="__MANROPE_LATIN_PRELOAD__">',
      "assets/manrope-latin-wght-normal-test.woff2"
    );
    expect(html).toContain(
      'href="/assets/manrope-latin-wght-normal-test.woff2"'
    );
    expect(html).not.toContain("__MANROPE_LATIN_PRELOAD__");
  });
});
