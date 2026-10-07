import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const distIndex = path.resolve("dist/index.html");

describe("built font preload", () => {
  it("preloads the emitted latin Manrope file", () => {
    expect(fs.existsSync(distIndex)).toBe(true);
    const html = fs.readFileSync(distIndex, "utf8");
    const href = html.match(
      /<link rel="preload" as="font" type="font\/woff2" crossorigin="anonymous" href="([^"]*manrope-latin-wght-normal-[^"]+\.woff2)">/
    )?.[1];

    expect(href).toBeDefined();
    expect(fs.existsSync(path.resolve("dist", href!.slice(1)))).toBe(true);
  });
});
