import fs from "node:fs";
import { createHash } from "node:crypto";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { execFileSync } from "node:child_process";

const hasRefreshJournal = (destination) => {
  try {
    const gitOptions = { stdio: ["ignore", "pipe", "ignore"], encoding: "utf8" };
    const [root, journalPath, head] = execFileSync("git", ["rev-parse", "--show-toplevel", "--path-format=absolute", "--git-path", "refresh-outputs.json", "HEAD"], { cwd: path.dirname(destination), ...gitOptions }).trim().split(/\r?\n/);
    const relative = path.relative(root, path.resolve(destination));
    if (!root || !journalPath || !head || !relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return false;
    const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
    return journal.head === head
      && journal.baseline && typeof journal.baseline === "object"
      && !Array.isArray(journal.baseline)
      && journal.checkpoint && typeof journal.checkpoint === "object" && !Array.isArray(journal.checkpoint);
  } catch {
    return false;
  }
};

export const writeFileAtomic = (destination, contents, { refreshRecovery = false } = {}) => {
  const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
  const owner = refreshRecovery && hasRefreshJournal(destination) ? `${temporary}.owner` : undefined;
  let ownerCreated = false;
  let temporaryCreated = false;
  let renamed = false;
  try {
    // The proof must exist before the temporary: a crash in between can only
    // leave an owner file with no temporary, which recovery validates and
    // removes. The old order left an unprovable temporary behind.
    if (owner) {
      const proof = JSON.stringify({ version: 1, pid: process.pid, target: path.resolve(destination), temporary: path.basename(temporary), sha256: createHash("sha256").update(contents).digest("hex") });
      const ownerFd = fs.openSync(owner, "wx");
      ownerCreated = true;
      try { fs.writeFileSync(ownerFd, proof); } finally { fs.closeSync(ownerFd); }
    }
    const temporaryFd = fs.openSync(temporary, "wx");
    temporaryCreated = true;
    try { fs.writeFileSync(temporaryFd, contents); } finally { fs.closeSync(temporaryFd); }
    fs.renameSync(temporary, destination);
    renamed = true;
    // The rename is the commit point. Removing the proof afterwards leaves a
    // short window with an orphan proof; recovery validates and removes it.
    if (owner) fs.rmSync(owner, { force: true });
  } catch (error) {
    if (temporaryCreated && !renamed) fs.rmSync(temporary, { force: true });
    if (ownerCreated && owner) fs.rmSync(owner, { force: true });
    throw error;
  }
};
