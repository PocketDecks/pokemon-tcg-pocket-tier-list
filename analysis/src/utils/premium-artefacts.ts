import { createHash } from "node:crypto";
import path from "node:path";

export const PREMIUM_WINDOWS = ["30d", "all"] as const;
export type PremiumWindow = (typeof PREMIUM_WINDOWS)[number];

export const PREMIUM_BASES = ["best-decks", "matchup-data", "meta-share"] as const;

export const PREMIUM_ARTEFACT_NAMES: readonly string[] = PREMIUM_BASES.flatMap((base) =>
  PREMIUM_WINDOWS.map((window) => `${base}-${window}`)
);

export const PREMIUM_DIR = path.resolve(__dirname, "../../out/premium");

export const PUBLIC_DATA_PREFIX = "../public/data/";

export const premiumFilePath = (name: string, dir: string = PREMIUM_DIR): string =>
  path.join(dir, `${name}.json`);

export const sha256Hex = (text: string): string =>
  createHash("sha256").update(text, "utf8").digest("hex");

const premiumNameOf = (file: string): string | null => {
  if (!file.startsWith(PUBLIC_DATA_PREFIX)) return null;
  const rest = file.slice(PUBLIC_DATA_PREFIX.length);
  if (!rest.endsWith(".json")) return null;
  const name = rest.slice(0, -".json".length);
  return PREMIUM_ARTEFACT_NAMES.includes(name) ? name : null;
};

export const splitArtefactFiles = (
  files: Record<string, string>
): { publicFiles: Record<string, string>; premiumFiles: Record<string, string> } => {
  const publicFiles: Record<string, string> = {};
  const premiumFiles: Record<string, string> = {};
  for (const [file, content] of Object.entries(files)) {
    const name = premiumNameOf(file);
    if (name === null) publicFiles[file] = content;
    else premiumFiles[name] = content;
  }
  return { publicFiles, premiumFiles };
};

export const premiumVersion = (premiumFiles: Record<string, string>): string => {
  const hash = createHash("sha256");
  for (const name of Object.keys(premiumFiles).sort()) {
    const content = premiumFiles[name];
    hash.update(`${Buffer.byteLength(name, "utf8")}:${name}\n`);
    hash.update(`${Buffer.byteLength(content, "utf8")}:`);
    hash.update(content, "utf8");
    hash.update("\n");
  }
  return hash.digest("hex").slice(0, 16);
};

export const renderDataVersion = (version: string): string =>
  `{ "premium": "${version}" }\n`;
