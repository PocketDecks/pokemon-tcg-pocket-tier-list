import fs from "node:fs";
import { createHash } from "node:crypto";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { execFileSync } from "node:child_process";

let refreshJournalActive;

const hasRefreshJournal = (destination) => {
  if (refreshJournalActive !== undefined) return refreshJournalActive;
  try {
    const gitOptions = { stdio: ["ignore", "pipe", "ignore"], encoding: "utf8" };
    const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: path.dirname(destination), ...gitOptions }).trim();
    const journalName = execFileSync("git", ["rev-parse", "--git-path", "refresh-outputs.json"], { cwd: root, ...gitOptions }).trim();
    const journal = JSON.parse(fs.readFileSync(path.resolve(root, journalName), "utf8"));
    refreshJournalActive = journal.head === execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, ...gitOptions }).trim()
      && journal.baseline && typeof journal.baseline === "object"
      && !Array.isArray(journal.baseline)
      && journal.checkpoint && typeof journal.checkpoint === "object" && !Array.isArray(journal.checkpoint);
  } catch {
    refreshJournalActive = false;
  }
  return refreshJournalActive;
};

export const writeFileAtomic = (destination, contents, { refreshRecovery = false } = {}) => {
  const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
  const owner = refreshRecovery && hasRefreshJournal(destination) ? `${temporary}.owner` : undefined;
  let temporaryCreated = false;
  let ownerCreated = false;
  try {
    fs.writeFileSync(temporary, contents, { flag: "wx" });
    temporaryCreated = true;
    if (owner) {
      fs.writeFileSync(owner, JSON.stringify({ version: 1, pid: process.pid, target: path.resolve(destination), temporary: path.basename(temporary), sha256: createHash("sha256").update(contents).digest("hex") }), { flag: "wx" });
      ownerCreated = true;
    }
    fs.renameSync(temporary, destination);
    if (owner) fs.rmSync(owner, { force: true });
  } catch (error) {
    if (temporaryCreated) fs.rmSync(temporary, { force: true });
    if (ownerCreated && owner) fs.rmSync(owner, { force: true });
    throw error;
  }
};
