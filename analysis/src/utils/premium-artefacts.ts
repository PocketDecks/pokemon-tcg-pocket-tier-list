import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { freeDeckNames } from "../../../src/app/free-tier";
import {
  PipelineMatchupData,
  PipelineMetaShare,
  PipelinePartialDeck,
} from "../../../src/types/pipeline-data";
import { trimMatchupData, trimMetaShare } from "./trim-free-window";
import { renameWithRetry } from "./rename-with-retry";

export const PREMIUM_WINDOWS = ["30d", "all"] as const;
export type PremiumWindow = (typeof PREMIUM_WINDOWS)[number];

export const PREMIUM_BASES = ["best-decks", "matchup-data", "meta-share"] as const;

export const TRIMMED_BASES = ["matchup-data", "meta-share"] as const;
export type TrimmedBase = (typeof TRIMMED_BASES)[number];

export const TRIMMED_WINDOWS = ["10d", "20d"] as const;

const premiumWindowNames: readonly string[] = PREMIUM_BASES.flatMap((base) =>
  PREMIUM_WINDOWS.map((window) => `${base}-${window}`)
);

export const PREMIUM_ARTEFACT_NAMES: readonly string[] = [
  ...premiumWindowNames,
  ...TRIMMED_BASES.flatMap((base) => TRIMMED_WINDOWS.map((window) => `${base}-${window}`)),
];

export const PREMIUM_DIR = path.resolve(__dirname, "../../out/premium");

export const previousPremiumDir = (dir: string = PREMIUM_DIR): string =>
  path.join(path.dirname(dir), "premium-previous");

const readSnapshot = (file: string): string | undefined => {
  if (!fs.existsSync(file)) return undefined;
  const contents = fs.readFileSync(file, "utf8");
  try {
    return isSnapshotValue(JSON.parse(contents)) ? contents : undefined;
  } catch {
    return undefined;
  }
};

const writeAside = (previous: string, file: string, contents: string): void => {
  const temporary = path.join(previous, `${file}.snapshot-tmp-${process.pid}`);
  fs.writeFileSync(temporary, contents);
  renameWithRetry(temporary, path.join(previous, file));
};

const removeSnapshotTemps = (previous: string): void => {
  for (const file of fs.readdirSync(previous)) {
    if (file.includes(".snapshot-tmp-")) fs.rmSync(path.join(previous, file), { force: true });
  }
};

const pairedFilesOf = (window: PremiumWindow): string[] =>
  ["best-decks", "meta-share"].map((base) => `${base}-${window}.json`);

export const snapshotPremiumPrevious = (dir: string = PREMIUM_DIR): void => {
  if (!fs.existsSync(dir)) return;
  const previous = previousPremiumDir(dir);
  fs.mkdirSync(previous, { recursive: true });
  removeSnapshotTemps(previous);
  const paired = new Set<string>();
  for (const window of PREMIUM_WINDOWS) {
    const files = pairedFilesOf(window);
    for (const file of files) paired.add(file);
    const contents = Object.fromEntries(
      files.map((file) => [file, readSnapshot(path.join(dir, file))])
    );
    const complete = files.every((file) => contents[file] !== undefined);
    for (const file of files) {
      const body = contents[file];
      if (complete && body !== undefined) {
        writeAside(previous, file, body);
      } else {
        fs.rmSync(path.join(previous, file), { force: true });
      }
    }
  }
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".json") || paired.has(file)) continue;
    const contents = readSnapshot(path.join(dir, file));
    if (contents !== undefined) writeAside(previous, file, contents);
  }
};

export const PUBLIC_DATA_PREFIX = "../public/data/";

export const premiumFilePath = (name: string, dir: string = PREMIUM_DIR): string =>
  path.join(dir, `${name}.json`);

export const sha256Hex = (text: string): string =>
  createHash("sha256").update(text, "utf8").digest("hex");

const dataNameOf = (file: string): string | null => {
  if (!file.startsWith(PUBLIC_DATA_PREFIX)) return null;
  const rest = file.slice(PUBLIC_DATA_PREFIX.length);
  return rest.endsWith(".json") ? rest.slice(0, -".json".length) : null;
};

const TRIMMED_NAME = new RegExp(
  `^(${TRIMMED_BASES.join("|")})(?:-(${TRIMMED_WINDOWS.join("|")}))?$`
);

const isSnapshotValue = (value: unknown): boolean =>
  Array.isArray(value) ||
  (value !== null &&
    typeof value === "object" &&
    typeof (value as { generatedAt?: unknown }).generatedAt === "string" &&
    Array.isArray((value as { decks?: unknown }).decks));

const render = (value: unknown): string => JSON.stringify(value, null, 2);

const freeNamesFor = (files: Record<string, string>, suffix: string): Set<string> => {
  const file = `${PUBLIC_DATA_PREFIX}best-decks${suffix}.json`;
  const content = files[file];
  if (content === undefined) {
    throw new Error(`cannot trim the public data without best-decks${suffix}.json`);
  }
  return freeDeckNames(JSON.parse(content) as PipelinePartialDeck[]);
};

export const splitArtefactFiles = (
  files: Record<string, string>
): { publicFiles: Record<string, string>; premiumFiles: Record<string, string> } => {
  const publicFiles: Record<string, string> = {};
  const premiumFiles: Record<string, string> = {};
  for (const [file, content] of Object.entries(files)) {
    const name = dataNameOf(file);
    if (name !== null && premiumWindowNames.includes(name)) {
      premiumFiles[name] = content;
      continue;
    }
    const trimmed = name === null ? null : TRIMMED_NAME.exec(name);
    if (trimmed === null) {
      publicFiles[file] = content;
      continue;
    }
    const [, base, window] = trimmed;
    const freeNames = freeNamesFor(files, window ? `-${window}` : "");
    const parsed: unknown = JSON.parse(content);
    publicFiles[file] = render(
      base === "matchup-data"
        ? trimMatchupData(parsed as PipelineMatchupData, freeNames)
        : trimMetaShare(parsed as PipelineMetaShare, freeNames)
    );
    if (window) premiumFiles[name as string] = content;
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

export const premiumVersionSnapshotDir = (version: string, dir: string = PREMIUM_DIR): string =>
  path.join(previousPremiumDir(dir), version);

export const snapshotPremiumVersion = (
  premiumFiles: Record<string, string>,
  version: string,
  dir: string = PREMIUM_DIR
): void => {
  if (premiumVersion(premiumFiles) !== version) throw new Error("premium snapshot version does not match its files");
  const target = premiumVersionSnapshotDir(version, dir);
  fs.mkdirSync(target, { recursive: true });
  for (const name of PREMIUM_ARTEFACT_NAMES) {
    fs.writeFileSync(path.join(target, `${name}.json`), premiumFiles[name]);
  }
};

export const readPremiumVersionSnapshot = (
  version: string,
  dir: string = PREMIUM_DIR
): Record<string, string> | undefined => {
  const target = premiumVersionSnapshotDir(version, dir);
  try {
    const files = Object.fromEntries(PREMIUM_ARTEFACT_NAMES.map((name) => [
      name,
      fs.readFileSync(path.join(target, `${name}.json`), "utf8"),
    ]));
    return premiumVersion(files) === version ? files : undefined;
  } catch {
    return undefined;
  }
};

export const loadPremiumSnapshotForVersion = (
  version: string,
  dir: string = PREMIUM_DIR
): Record<string, string> | undefined => {
  const stored = readPremiumVersionSnapshot(version, dir);
  if (stored) return stored;
  const previous = previousPremiumDir(dir);
  try {
    const legacy = Object.fromEntries(PREMIUM_ARTEFACT_NAMES.map((name) => [
      name,
      fs.readFileSync(path.join(previous, `${name}.json`), "utf8"),
    ]));
    if (premiumVersion(legacy) !== version) return undefined;
    snapshotPremiumVersion(legacy, version, dir);
    return legacy;
  } catch {
    return undefined;
  }
};

export const renderDataVersion = (version: string): string =>
  `{ "premium": "${version}" }\n`;
