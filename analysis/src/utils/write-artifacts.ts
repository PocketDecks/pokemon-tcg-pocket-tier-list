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

export const writeArtefacts = (files: Record<string, string>): void => {
  const artefacts: Artefact[] = Object.keys(files).map((target) => {
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

  for (const artefact of artefacts) {
    if (
      fs.existsSync(artefact.temporary) ||
      fs.existsSync(artefact.backup) ||
      fs.existsSync(artefact.marker)
    ) {
      throw new Error(`Refusing stale staging files for ${artefact.target}`);
    }
  }

  try {
    for (const artefact of artefacts) {
      fs.writeFileSync(artefact.temporary, artefact.content);
      // A target this write creates leaves a marker, so an interrupted run
      // leaves evidence that the target is new.
      if (!artefact.hadTarget) fs.writeFileSync(artefact.marker, "");
    }

    for (const artefact of artefacts) {
      if (artefact.hadTarget) {
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
      }
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
    }
  } catch (error) {
    for (const artefact of [...artefacts].reverse()) {
      try {
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
      } catch (rollbackError) {
        console.warn(`Could not roll back artefact ${artefact.target}:`, rollbackError);
      }
    }

    for (const artefact of artefacts) {
      if (artefact.retainTemporary || !fs.existsSync(artefact.temporary)) continue;
      try {
        fs.rmSync(artefact.temporary);
      } catch (cleanupError) {
        console.warn(`Could not remove artefact staging file ${artefact.temporary}:`, cleanupError);
      }
    }
    throw error;
  }

  for (const artefact of artefacts) {
    if (!fs.existsSync(artefact.backup)) continue;
    try {
      fs.rmSync(artefact.backup);
    } catch (cleanupError) {
      console.warn(
        `Could not remove artefact backup ${artefact.backup}. The committed ` +
          `target remains active. Verify it and remove the backup before rerunning:`,
        cleanupError
      );
    }
  }

  for (const artefact of artefacts) {
    if (!fs.existsSync(artefact.marker)) continue;
    try {
      fs.rmSync(artefact.marker);
    } catch (cleanupError) {
      console.warn(
        `Could not remove artefact marker ${artefact.marker}. The committed ` +
          `target remains active. Verify it and remove the marker before rerunning:`,
        cleanupError
      );
    }
  }
};
