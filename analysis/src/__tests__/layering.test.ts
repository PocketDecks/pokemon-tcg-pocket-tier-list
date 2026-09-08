import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

// Files in analysis/src/ that may import from analysis/scripts/, and why.
// Anything not listed here fails. An allowlist rather than a directory scan
// because the previous scan excluded __tests__ from its own file set, so it
// could not see the one file that crossed the boundary.
const PERMITTED_CROSSINGS: Record<string, string> = {
  "src/__tests__/deck-name-golden.test.ts":
    "replays the golden by calling the generator that produced it, so the " +
    "fixture and the code cannot drift. The generator is a script by convention, " +
    "not by dependency direction.",
};

describe("analysis/src/ import layering", () => {
  const srcDir = join(__dirname, "..");
  const analysisDir = join(srcDir, "..");

  const tsFiles = readdirSync(srcDir, { recursive: true })
    .filter((p): p is string => typeof p === "string" && p.endsWith(".ts"))
    .map((p) => join(srcDir, p));

  it("only imports from analysis/scripts/ where the allowlist says so", () => {
    const offenders: string[] = [];

    for (const file of tsFiles) {
      const rel = relative(analysisDir, file).replace(/\\/g, "/");
      if (PERMITTED_CROSSINGS[rel]) continue;

      const source = readFileSync(file, "utf8");
      // Catches from-imports, side-effect imports and dynamic import() calls.
      const importSpecifiers = source.match(
        /(?:from\s+['"][^'"]*|import\s*\(\s*['"][^'"]*|import\s+['"][^'"]*)scripts\//g
      );
      if (importSpecifiers) offenders.push(`${rel}: ${importSpecifiers.join(", ")}`);
    }

    expect(offenders).toEqual([]);
  });

  it("names a reason for every permitted crossing", () => {
    // An allowlist entry with no stated reason is how a hole becomes permanent.
    for (const [file, reason] of Object.entries(PERMITTED_CROSSINGS)) {
      expect(reason.length).toBeGreaterThan(20);
      expect(tsFiles.some((f) => relative(analysisDir, f).replace(/\\/g, "/") === file))
        .toBe(true);
    }
  });
});
