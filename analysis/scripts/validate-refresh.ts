import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { loadPremiumSnapshotForVersion, PREMIUM_DIR, premiumVersionSnapshotDir } from "../src/utils/premium-artefacts";
import {
  defaultGitRunner,
  inspectMainPremiumVersion,
  resolveCanonicalMainRef,
  type PremiumGitRunner,
} from "../src/utils/premium-files";
import {
  REFRESH_WINDOWS,
  validateRefresh,
} from "../src/utils/validate-refresh";
import { windowArtefactName, isPremiumWindow } from "../../src/types/meta-windows";

export interface ValidateRefreshCliOptions {
  args?: string[];
  repoRoot?: string;
  git?: PremiumGitRunner;
  validate?: typeof validateRefresh;
  log?: (line: string) => void;
  reportError?: (line: string) => void;
}

export const runValidateRefreshCli = ({
  args = process.argv.slice(2),
  repoRoot = path.resolve(__dirname, "../.."),
  git = defaultGitRunner,
  validate = validateRefresh,
  log = console.log,
  reportError = console.error,
}: ValidateRefreshCliOptions = {}): number => {
  const flag = (name: string): string | null => {
    const index = args.indexOf(name);
    if (index < 0) return null;
    const value = args[index + 1];
    if (!value || value.startsWith("-")) throw new Error(`${name} needs a value`);
    return value;
  };

  const readPrevious = (premiumDir: string): string | null => {
    const explicit = flag("--previous");
    if (explicit) return explicit;
    if (args.includes("--no-previous")) return null;

    const ref = flag("--previous-ref") ?? resolveCanonicalMainRef(repoRoot, git);
    if (!ref) throw new Error("cannot resolve the canonical main remote; pass --previous-ref <ref>");
    const mainVersionStatus = inspectMainPremiumVersion(repoRoot, ref, git);
    if (mainVersionStatus.status === "unreadable") {
      throw new Error(
        `Could not read the premium version committed at ${ref} ` +
        `(${mainVersionStatus.reason}); refusing to validate against an unreadable baseline. ` +
        "Fetch the canonical remote's main, repair public/data/data-version.json on main, " +
        "or pass --previous <dir> or --no-previous"
      );
    }
    const liveVersion = mainVersionStatus.status === "found" ? mainVersionStatus.version : undefined;
    const premiumSnapshot = liveVersion ? loadPremiumSnapshotForVersion(liveVersion, premiumDir) : undefined;
    if (liveVersion && !premiumSnapshot) {
      log(
        `No local premium snapshot for canonical main version ${liveVersion} in ` +
        `${premiumVersionSnapshotDir(liveVersion, premiumDir)}; first publish, ` +
        "so their thinner-than-last-time floors are skipped"
      );
    }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "refresh-previous-"));
    for (const window of REFRESH_WINDOWS) {
      const file = `public/data/${windowArtefactName("best-decks", window)}.json`;
      const metaFile = `public/data/${windowArtefactName("meta-share", window)}.json`;
      let contents: string | undefined;
      let metaContents: string | undefined;
      if (isPremiumWindow(window)) {
        contents = premiumSnapshot?.[windowArtefactName("best-decks", window)];
        metaContents = premiumSnapshot?.[windowArtefactName("meta-share", window)];
        if (contents === undefined) continue;
      } else {
        try {
          metaContents = git(["show", `${ref}:${metaFile}`], repoRoot);
        } catch {
          metaContents = undefined;
        }
      }
      if (contents === undefined) {
        try {
          contents = git(["show", `${ref}:${file}`], repoRoot);
        } catch {
          throw new Error(
            `cannot read ${ref}:${file}; fetch ${ref} or pass --previous <dir> or --no-previous`
          );
        }
      }
      fs.writeFileSync(path.join(dir, `${windowArtefactName("best-decks", window)}.json`), contents);
      if (metaContents !== undefined) {
        fs.writeFileSync(path.join(dir, `${windowArtefactName("meta-share", window)}.json`), metaContents);
      }
    }
    return dir;
  };

  let dataDir: string;
  let imagesDir: string;
  let premiumDir: string;
  let previousDir: string | null;
  try {
    dataDir = flag("--data") ?? path.join(repoRoot, "public/data");
    imagesDir = flag("--images") ?? path.join(repoRoot, "public/og/deck");
    premiumDir = flag("--premium") ?? PREMIUM_DIR;
    previousDir = readPrevious(premiumDir);
  } catch (error) {
    reportError((error as Error).message);
    return 1;
  }

  const report = validate(dataDir, imagesDir, previousDir, premiumDir);

  for (const row of report.windows) {
    const previous = row.previous === null ? "no previous" : `previous ${row.previous}`;
    log(`${row.window}: ${row.archetypes} archetypes, floor ${row.floor}, ${previous}`);
  }
  log(
    `union: ${report.union} deck names, ${report.images} OG images, ` +
      `${report.missingImages.length} missing, ${report.orphanImages.length} orphan`
  );
  if (report.notCompared.length > 0) {
    log(`no previous publish for ${report.notCompared.join(", ")}; their thinner-than-last-time floors were skipped`);
  }

  if (report.failures.length) {
    for (const failure of report.failures) reportError(failure);
    return 1;
  }
  return 0;
};

if (require.main === module) {
  process.exitCode = runValidateRefreshCli();
}
