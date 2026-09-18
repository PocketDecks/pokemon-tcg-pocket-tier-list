import fs from "fs";

type Artifact = {
  target: string;
  temporary: string;
  backup: string;
  content: string;
  previous: string | null;
  hadTarget: boolean;
  committed: boolean;
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

export const writeArtifacts = (files: Record<string, string>): void => {
  const artifacts: Artifact[] = Object.keys(files).map((target) => {
    const hadTarget = fs.existsSync(target);
    return {
      target,
      temporary: `${target}.tmp`,
      backup: `${target}.bak`,
      content: files[target],
      previous: hadTarget ? fs.readFileSync(target, "utf8") : null,
      hadTarget,
      committed: false,
    };
  });

  for (const artifact of artifacts) {
    if (fs.existsSync(artifact.temporary) || fs.existsSync(artifact.backup)) {
      throw new Error(`Refusing stale staging files for ${artifact.target}`);
    }
  }

  try {
    for (const artifact of artifacts) {
      fs.writeFileSync(artifact.temporary, artifact.content);
    }

    for (const artifact of artifacts) {
      if (artifact.hadTarget) {
        try {
          renameWithRetry(artifact.target, artifact.backup);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "EPERM") throw error;
          // The target is held open, so it keeps its place and `previous`
          // preserves the old contents for rollback.
        }
      }
      try {
        renameWithRetry(artifact.temporary, artifact.target);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EPERM") throw error;
        fs.writeFileSync(artifact.target, artifact.content);
        fs.rmSync(artifact.temporary, { force: true });
      }
      artifact.committed = true;
    }
  } catch (error) {
    for (const artifact of [...artifacts].reverse()) {
      try {
        if (fs.existsSync(artifact.backup)) {
          if (fs.existsSync(artifact.target)) fs.rmSync(artifact.target);
          fs.renameSync(artifact.backup, artifact.target);
        } else if (artifact.committed) {
          if (artifact.previous !== null) {
            fs.writeFileSync(artifact.target, artifact.previous);
          } else if (fs.existsSync(artifact.target)) {
            fs.rmSync(artifact.target);
          }
        }
      } catch (rollbackError) {
        console.warn(`Could not roll back artifact ${artifact.target}:`, rollbackError);
      }
    }

    for (const artifact of artifacts) {
      if (!fs.existsSync(artifact.temporary)) continue;
      try {
        fs.rmSync(artifact.temporary);
      } catch (cleanupError) {
        console.warn(`Could not remove artifact staging file ${artifact.temporary}:`, cleanupError);
      }
    }
    throw error;
  }

  for (const artifact of artifacts) {
    if (!fs.existsSync(artifact.backup)) continue;
    try {
      fs.rmSync(artifact.backup);
    } catch (cleanupError) {
      console.warn(
        `Could not remove artifact backup ${artifact.backup}. The committed ` +
          `target remains active. Verify it and remove the backup before rerunning:`,
        cleanupError
      );
    }
  }
};
