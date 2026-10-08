import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const consentDir = resolve(process.cwd(), "src/consent");
const thisFileName = "consent-styling-guard.test.ts";

const listFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });

const sources = listFiles(consentDir)
  .filter((file) => !file.endsWith(thisFileName))
  .map((file) => ({ file, text: readFileSync(file, "utf8") }));

describe("consent styling guard", () => {
  it("reads the consent sources from disk", () => {
    expect(sources.length).toBeGreaterThan(0);
  });

  it("contains no !important declarations", () => {
    const offenders = sources.filter(({ text }) => text.includes("!important")).map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it("contains no c15t-ui- selectors", () => {
    const offenders = sources.filter(({ text }) => text.includes("c15t-ui-")).map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it("imports the layer order before c15t's stylesheet", () => {
    const provider = readFileSync(resolve(consentDir, "ConsentProvider.tsx"), "utf8");
    const layers = provider.indexOf('import "../styles/layers.css";');
    const c15tStyles = provider.indexOf('import "@c15t/react/styles.css";');

    expect(layers).toBeGreaterThanOrEqual(0);
    expect(c15tStyles).toBeGreaterThan(layers);
  });
});
