import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const PERMITTED_CROSSINGS: Record<string, { specifier: string; reason: string }> = {
  "src/__tests__/deck-name-golden.test.ts": {
    specifier: "../../scripts/generate-deck-name-golden",
    reason:
      "replays the golden by calling the generator that produced it, so the " +
      "fixture and the code cannot drift. The generator is a script by " +
      "convention, not by dependency direction.",
  },
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
      const permitted = PERMITTED_CROSSINGS[rel];

      const source = readFileSync(file, "utf8");
      const importSpecifiers = [
        ...source.matchAll(
          /(?:from|import\s*\(|import)\s*['"]([^'"]*scripts\/[^'"]*)['"]/g
        ),
      ].map((m) => m[1]);
      if (!importSpecifiers.length) continue;

      if (!permitted) {
        offenders.push(`${rel}: ${importSpecifiers.join(", ")}`);
        continue;
      }

      for (const specifier of importSpecifiers) {
        if (specifier !== permitted.specifier) {
          offenders.push(`${rel}: ${specifier} (permitted: ${permitted.specifier})`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("names a reason for every permitted crossing", () => {
    for (const [file, { reason }] of Object.entries(PERMITTED_CROSSINGS)) {
      expect(reason.length).toBeGreaterThan(20);
      expect(tsFiles.some((f) => relative(analysisDir, f).replace(/\\/g, "/") === file))
        .toBe(true);
    }
  });
});
