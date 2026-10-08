import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const sourceRoot = join(process.cwd(), "src");
const rawColour = /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|(?<![-\w])(white|black)(?![-\w])/gi;

const sourceFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(file);
    if (!/\.(ts|tsx|css)$/.test(entry.name)) return [];
    if (entry.name.includes("test") || entry.name.includes("fixture")) return [];
    if (relative(sourceRoot, file).replaceAll("\\", "/") === "styles/theme-tokens.ts") return [];
    return [file];
  });

describe("source colour tokens", () => {
  it("keeps raw colour literals in the theme token module", () => {
    const violations = sourceFiles(sourceRoot).flatMap((file) => {
      const source = readFileSync(file, "utf8");
      return [...source.matchAll(rawColour)].map((match) => {
        const line = source.slice(0, match.index).split("\n").length;
        return `${relative(process.cwd(), file)}:${line}: ${match[0]}`;
      });
    });

    expect(violations).toEqual([]);
  });
});
