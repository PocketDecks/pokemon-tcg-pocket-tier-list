import fs from "fs";

type Artefact = {
  target: string;
  temporary: string;
  backup: string;
  content: string;
  previous: string | null;
  hadTarget: boolean;
  committed: boolean;
  retainTemporary: boolean;
};

// Windows keeps EPERM-locked targets for as long as a reader holds them, so
// short retries cover transient locks before the direct-write fallback.
const renameWithRetry = (source: string, destination: string): void => {
  const attempts = 3;
  for (let attempt = 1; ; attempt += 1) {
    try {
      fs.renameSync(source, destination);
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EPERM" || attempt >= attempts) {
        throw error;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50 * attempt);
    }
  }
};

export const writeArtefacts = (files: Record<string, string>): void => {
  const artefacts: Artefact[] = Object.keys(files).map((target) => {
    const hadTarget = fs.existsSync(target);
    return {
      target,
      temporary: `${target}.tmp`,
      backup: `${target}.bak`,
      content: files[target],
      previous: hadTarget ? fs.readFileSync(target, "utf8") : null,
      hadTarget,
      committed: false,
      retainTemporary: false,
    };
  });

  for (const artefact of artefacts) {
    if (fs.existsSync(artefact.temporary) || fs.existsSync(artefact.backup)) {
      throw new Error(`Refusing stale staging files for ${artefact.target}`);
    }
  }

  try {
    for (const artefact of artefacts) {
      fs.writeFileSync(artefact.temporary, artefact.content);
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
          fs.renameSync(artefact.backup, artefact.target);
        } else if (artefact.committed) {
          if (artefact.previous !== null) {
            fs.writeFileSync(artefact.target, artefact.previous);
          } else if (fs.existsSync(artefact.target)) {
            fs.rmSync(artefact.target);
          }
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
};
