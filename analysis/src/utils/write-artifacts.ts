import fs from "fs";

type Artifact = {
  target: string;
  temporary: string;
  backup: string;
  hadTarget: boolean;
  committed: boolean;
};

export const writeArtifacts = (files: Record<string, string>): void => {
  const artifacts: Artifact[] = Object.keys(files).map((target) => ({
    target,
    temporary: `${target}.tmp`,
    backup: `${target}.bak`,
    hadTarget: fs.existsSync(target),
    committed: false,
  }));

  for (const artifact of artifacts) {
    if (fs.existsSync(artifact.temporary) || fs.existsSync(artifact.backup)) {
      throw new Error(`Refusing stale staging files for ${artifact.target}`);
    }
  }

  try {
    for (const artifact of artifacts) {
      fs.writeFileSync(artifact.temporary, files[artifact.target]);
    }

    for (const artifact of artifacts) {
      if (artifact.hadTarget) {
        fs.renameSync(artifact.target, artifact.backup);
      }
      fs.renameSync(artifact.temporary, artifact.target);
      artifact.committed = true;
    }
  } catch (error) {
    for (const artifact of [...artifacts].reverse()) {
      try {
        if (fs.existsSync(artifact.backup)) {
          if (fs.existsSync(artifact.target)) fs.rmSync(artifact.target);
          fs.renameSync(artifact.backup, artifact.target);
        } else if (artifact.committed && fs.existsSync(artifact.target)) {
          fs.rmSync(artifact.target);
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
      console.warn(`Could not remove artifact backup ${artifact.backup}:`, cleanupError);
    }
  }
};
