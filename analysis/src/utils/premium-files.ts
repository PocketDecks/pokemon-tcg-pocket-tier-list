import fs from "node:fs";

import {
  PREMIUM_ARTEFACT_NAMES,
  premiumFilePath,
  premiumVersion,
} from "./premium-artefacts";

export const loadPremiumFiles = (dir: string): Record<string, string> => {
  const files: Record<string, string> = {};
  for (const name of PREMIUM_ARTEFACT_NAMES) {
    const file = premiumFilePath(name, dir);
    if (!fs.existsSync(file)) throw new Error(`missing ${file}`);
    files[name] = fs.readFileSync(file, "utf8");
  }
  return files;
};

export const readCommittedVersion = (file: string): string => {
  const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
  const value = (parsed as { premium?: unknown } | null)?.premium;
  if (typeof value !== "string" || !/^[0-9a-f]{16}$/.test(value)) {
    throw new Error(`${file} has no valid premium version`);
  }
  return value;
};

export const assertVersionMatches = (
  files: Record<string, string>,
  committed: string
): void => {
  const actual = premiumVersion(files);
  if (actual !== committed) {
    throw new Error(
      `the premium files hash to ${actual} but data-version.json says ${committed}; ` +
        "run the refresh again so the committed version matches"
    );
  }
};

export const readProjectId = (file: string): string => {
  const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
  const value = (parsed as { projects?: { default?: unknown } } | null)?.projects?.default;
  if (typeof value !== "string" || value === "") {
    throw new Error(`${file} has no default project`);
  }
  return value;
};
