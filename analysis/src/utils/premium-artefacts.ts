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

export const prunePremiumSnapshots = (
  protectedVersions: readonly string[],
  dir: string = PREMIUM_DIR
): void => {
  const cache = previousPremiumDir(dir);
  let entries: fs.Dirent[];
  const rootPath = path.resolve(cache);
  for (let current = rootPath; ; current = path.dirname(current)) {
    try {
      const detail = fs.lstatSync(current);
      if (detail.isSymbolicLink()) return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw new Error(`cannot inspect snapshot cache path ${current}: ${String(error)}`);
    }
    if (path.dirname(current) === current) break;
  }
  try {
    const root = fs.lstatSync(cache);
    if (!root.isDirectory()) throw new Error(`snapshot cache is not a directory: ${cache}`);
    entries = fs.readdirSync(cache, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw new Error(`cannot list snapshot cache ${cache}: ${String(error)}`);
  }
  const protectedSet = new Set(protectedVersions);
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink() || !/^[0-9a-f]{16}$/.test(entry.name) || protectedSet.has(entry.name)) {
      continue;
    }
    const target = path.resolve(rootPath, entry.name);
    const relative = path.relative(rootPath, target);
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) continue;
    try {
      const details = fs.lstatSync(target);
      if (details.isDirectory() && !details.isSymbolicLink()) {
        fs.rmSync(target, { recursive: true, force: true });
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") throw new Error(`cannot remove snapshot ${target}: ${String(error)}`);
    }
  }
};

export const renderDataVersion = (version: string): string =>
  `{ "premium": "${version}" }\n`;
