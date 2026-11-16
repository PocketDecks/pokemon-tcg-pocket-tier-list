import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { freeDeckNames } from "../../../src/app/free-tier";
import {
  ARTEFACT_BASES,
  DEFAULT_WINDOW,
  PREMIUM_BASES,
  PREMIUM_WINDOWS,
  TRIMMED_BASES,
  TRIMMED_WINDOWS,
  WINDOW_IDS,
  isPremiumWindow,
  windowArtefactName,
  windowDataFile,
  type ArtefactBase,
  type TrimmedBase,
  type WindowId,
} from "../../../src/types/meta-windows";
import { WindowArtefacts } from "./build-window-artefacts";
import { trimMetaShare } from "./trim-free-window";

const premiumWindowNames: readonly string[] = PREMIUM_BASES.flatMap((base) =>
  PREMIUM_WINDOWS.map((window) => windowArtefactName(base, window))
);

export const PREMIUM_ARTEFACT_NAMES: readonly string[] = [
  ...premiumWindowNames,
  ...TRIMMED_BASES.flatMap((base) => TRIMMED_WINDOWS.map((window) => windowArtefactName(base, window))),
];

export const PREMIUM_DIR = path.resolve(__dirname, "../../out/premium");

export const previousPremiumDir = (dir: string = PREMIUM_DIR): string =>
  path.join(path.dirname(dir), "premium-previous");

export const PUBLIC_DATA_PREFIX = "../public/data/";

export const premiumFilePath = (name: string, dir: string = PREMIUM_DIR): string =>
  path.join(dir, `${name}.json`);

export const sha256Hex = (text: string): string =>
  createHash("sha256").update(text, "utf8").digest("hex");

const render = (value: unknown): string => JSON.stringify(value, null, 2);

type PayloadBase = ArtefactBase;
type Payloads = Record<PayloadBase, string>;

const isTrimmedBase = (base: ArtefactBase): base is TrimmedBase => TRIMMED_BASES.some((trimmed) => trimmed === base);

const isWindowIn = (list: readonly string[], window: WindowId): boolean => list.includes(window);

const publicPath = (base: PayloadBase, window?: WindowId): string =>
  `${PUBLIC_DATA_PREFIX}${
    window ? `${windowArtefactName(base, window)}.json` : windowDataFile(base, DEFAULT_WINDOW)
  }`;

const serialise = (artefacts: WindowArtefacts): Payloads => ({
  "best-decks": render(artefacts.bestDecks),
  "meta-share": render(artefacts.metaShare),
  "matchup-data": render(artefacts.matchupData),
});

const serialiseTrimmed = (artefacts: WindowArtefacts, full: Payloads): Payloads => ({
  ...full,
  "meta-share": render(trimMetaShare(artefacts.metaShare, freeDeckNames(artefacts.bestDecks))),
});

// Public files hold the free tier. 30d and all-time exist only as premium
// files; 10d and 20d are public, with meta share movement kept for the free
// decks and the full meta share premium. The default window is also written un-suffixed for readers that
// predate the selector.
export const splitWindowArtefacts = (
  artefacts: Record<WindowId, WindowArtefacts>
): { publicFiles: Record<string, string>; premiumFiles: Record<string, string> } => {
  const publicFiles: Record<string, string> = {};
  const premiumFiles: Record<string, string> = {};
  let defaultPublic: Payloads | undefined;

  for (const window of WINDOW_IDS) {
    const full = serialise(artefacts[window]);
    if (isPremiumWindow(window)) {
      for (const base of ARTEFACT_BASES) premiumFiles[windowArtefactName(base, window)] = full[base];
      continue;
    }
    const trimmed = isWindowIn(TRIMMED_WINDOWS, window);
    const free = trimmed ? serialiseTrimmed(artefacts[window], full) : full;
    for (const base of ARTEFACT_BASES) {
      publicFiles[publicPath(base, window)] = free[base];
      if (trimmed && isTrimmedBase(base)) premiumFiles[windowArtefactName(base, window)] = full[base];
    }
    if (window === DEFAULT_WINDOW) defaultPublic = free;
  }

  if (!defaultPublic) throw new Error(`the default window ${DEFAULT_WINDOW} has no public files`);
  for (const base of ARTEFACT_BASES) publicFiles[publicPath(base)] = defaultPublic[base];
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

export const loadPremiumSnapshotForVersion = (
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
