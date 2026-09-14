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

    for (const artifact of artifacts) {
      if (fs.existsSync(artifact.backup)) fs.rmSync(artifact.backup);
    }
  } catch (error) {
    for (const artifact of [...artifacts].reverse()) {
      if (fs.existsSync(artifact.backup)) {
        if (fs.existsSync(artifact.target)) fs.rmSync(artifact.target);
        fs.renameSync(artifact.backup, artifact.target);
      } else if (artifact.committed && fs.existsSync(artifact.target)) {
        fs.rmSync(artifact.target);
      }
    }

    for (const artifact of artifacts) {
      if (fs.existsSync(artifact.temporary)) fs.rmSync(artifact.temporary);
      if (fs.existsSync(artifact.backup)) fs.rmSync(artifact.backup);
    }
    throw error;
  }
};