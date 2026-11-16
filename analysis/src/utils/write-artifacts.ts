import fs from "fs";
import { renameWithRetry } from "./rename-with-retry";

type Artefact = {
  target: string;
  temporary: string;
  backup: string;
  marker: string;
  content: string;
  previous: string | null;
  hadTarget: boolean;
  committed: boolean;
  retainTemporary: boolean;
};

const planArtefacts = (files: Record<string, string>): Artefact[] =>
  Object.keys(files).map((target) => {
    const hadTarget = fs.existsSync(target);
    return {
      target,
      temporary: `${target}.tmp`,
      backup: `${target}.bak`,
      marker: `${target}.created`,
      content: files[target],
      previous: hadTarget ? fs.readFileSync(target, "utf8") : null,
      hadTarget,
      committed: false,
      retainTemporary: false,
    };
  });

const refuseStale = (artefact: Artefact): never => {
  throw new Error(`Refusing stale staging files for ${artefact.target}`);
};

const preflight = (artefacts: Artefact[]): void => {
  for (const artefact of artefacts) {
    if (
      fs.existsSync(artefact.temporary) ||
      fs.existsSync(artefact.backup) ||
      fs.existsSync(artefact.marker)
    ) {
      refuseStale(artefact);
    }
  }
};

const stage = (artefacts: Artefact[]): void => {
  for (const artefact of artefacts) {
    fs.writeFileSync(artefact.temporary, artefact.content);
    // A target this write creates leaves a marker, so an interrupted run
    // leaves evidence that the target is new.
    if (!artefact.hadTarget) fs.writeFileSync(artefact.marker, "");
  }
};

const moveTargetToBackup = (artefact: Artefact): void => {
  try {
    renameWithRetry(artefact.target, artefact.backup);
  } catch (error) {
    artefact.retainTemporary = true;
    throw error;
  }
  if (!fs.existsSync(artefact.backup)) {
    artefact.retainTemporary = true;
    throw new Error(`Backup missing after renaming ${artefact.target}`);
  }
};

const installTemporary = (artefact: Artefact): void => {
  try {
    renameWithRetry(artefact.temporary, artefact.target);
  } catch (error) {
    if (
      (error as NodeJS.ErrnoException).code !== "EPERM" ||
      !artefact.hadTarget ||
      !fs.existsSync(artefact.backup)
    ) {
      throw error;
    }
    fs.writeFileSync(artefact.target, artefact.content);
    artefact.committed = true;
    fs.rmSync(artefact.temporary, { force: true });
  }
  artefact.committed = true;
};

const commit = (artefacts: Artefact[]): void => {
  for (const artefact of artefacts) {
    if (artefact.hadTarget) moveTargetToBackup(artefact);
    installTemporary(artefact);
  }
};

const rollbackOne = (artefact: Artefact): void => {
  if (fs.existsSync(artefact.backup)) {
    if (fs.existsSync(artefact.target)) fs.rmSync(artefact.target);
    renameWithRetry(artefact.backup, artefact.target);
  } else if (artefact.committed) {
    if (artefact.previous !== null) {
      fs.writeFileSync(artefact.target, artefact.previous);
    } else if (fs.existsSync(artefact.target)) {
      fs.rmSync(artefact.target);
    }
  }
  if (!fs.existsSync(artefact.target) && fs.existsSync(artefact.marker)) {
    fs.rmSync(artefact.marker);
  }
};

const rollback = (artefacts: Artefact[]): void => {
  for (const artefact of [...artefacts].reverse()) {
    try {
      rollbackOne(artefact);
    } catch (rollbackError) {
      console.warn(`Could not roll back artefact ${artefact.target}:`, rollbackError);
    }
  }
};

const removeOrWarn = (file: string, warning: string, options?: fs.RmOptions): void => {
  try {
    fs.rmSync(file, options);
  } catch (cleanupError) {
    console.warn(warning, cleanupError);
  }
};

const committedWarning = (kind: string, file: string): string =>
  `Could not remove artefact ${kind} ${file}. The committed ` +
  `target remains active. Verify it and remove the ${kind} before rerunning:`;

const cleanUpAfterFailure = (artefacts: Artefact[]): void => {
  for (const artefact of artefacts) {
    if (artefact.retainTemporary || !fs.existsSync(artefact.temporary)) continue;
    removeOrWarn(
      artefact.temporary,
      `Could not remove artefact staging file ${artefact.temporary}:`
    );
  }
};

const cleanUpAfterCommit = (artefacts: Artefact[]): void => {
  for (const artefact of artefacts) {
    if (!fs.existsSync(artefact.backup)) continue;
    removeOrWarn(artefact.backup, committedWarning("backup", artefact.backup));
  }
  for (const artefact of artefacts) {
    if (!fs.existsSync(artefact.marker)) continue;
    removeOrWarn(artefact.marker, committedWarning("marker", artefact.marker));
  }
};

export const writeArtefacts = (files: Record<string, string>): void => {
  const artefacts = planArtefacts(files);
  preflight(artefacts);
  try {
    stage(artefacts);
    commit(artefacts);
  } catch (error) {
    rollback(artefacts);
    cleanUpAfterFailure(artefacts);
    throw error;
  }
  cleanUpAfterCommit(artefacts);
};
