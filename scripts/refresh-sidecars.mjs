import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export const sha256 = (data) => createHash("sha256").update(data).digest("hex");

export const SIDECAR_SUFFIXES = {
  temporary: ".tmp",
  proof: ".tmp.owner",
  backup: ".bak",
  marker: ".created",
};

export const sidecarNames = (target) => ({
  temporary: `${target}${SIDECAR_SUFFIXES.temporary}`,
  proof: `${target}${SIDECAR_SUFFIXES.proof}`,
  backup: `${target}${SIDECAR_SUFFIXES.backup}`,
  marker: `${target}${SIDECAR_SUFFIXES.marker}`,
});

export const SIDECAR_SUFFIX = /\.(?:tmp\.owner|tmp|bak|created|owner)$/;

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
export const ATOMIC_SUFFIX_SOURCE = String.raw`(?:\.\d+\.${UUID}\.tmp(?:\.owner)?)?`;
const ATOMIC_TEMPORARY = new RegExp(String.raw`^(.*)\.(\d+)\.(${UUID})\.tmp(?:\.owner)?$`, "i");

export const atomicTemporaryName = (destination, pid, uuid) => `${destination}.${pid}.${uuid}.tmp`;
export const atomicProofName = (temporary) => `${temporary}.owner`;

export const parseAtomicTemporary = (name) => {
  const match = name.match(ATOMIC_TEMPORARY);
  if (!match) return undefined;
  const [, target, pid, uuid] = match;
  return { target, pid: Number(pid), temporary: atomicTemporaryName(target, pid, uuid) };
};

const SHA256_HEX = /^[0-9a-f]{64}$/;

export const buildArtefactProof = ({ content, previous }) =>
  JSON.stringify({
    version: 1,
    targetSha256: previous === null ? undefined : sha256(previous),
    sha256: sha256(content),
  });

export const buildAtomicProof = ({ destination, temporary, contents }) =>
  JSON.stringify({
    version: 1,
    pid: process.pid,
    target: path.resolve(destination),
    temporary: path.basename(temporary),
    sha256: sha256(contents),
  });

export const readProof = (file) => {
  if (!fs.existsSync(file)) return undefined;
  try {
    const record = JSON.parse(fs.readFileSync(file, "utf8"));
    return typeof record === "object" && record !== null ? record : undefined;
  } catch {
    return undefined;
  }
};

export const proofCoversTemporary = (record, temporaryBytes) =>
  record.version === 1 && record.sha256 === sha256(temporaryBytes);

export const proofCoversTarget = (record, targetBytes) => {
  const targetHash = sha256(targetBytes);
  return record.version === 1 && (record.targetSha256 === targetHash || record.sha256 === targetHash);
};

export const proofIsWellFormed = (record) =>
  record.version === 1 && SHA256_HEX.test(record.sha256 ?? "");

export const atomicProofIssue = (record, { pid, target, temporary }, readTemporary) =>
  !record ||
  record.version !== 1 ||
  record.pid !== pid ||
  record.target !== target ||
  record.temporary !== temporary ||
  !SHA256_HEX.test(record.sha256 ?? "") ||
  (readTemporary !== undefined && sha256(readTemporary()) !== record.sha256);

export const JOURNAL_NAME = "refresh-outputs.json";

export const git = (root, ...args) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();

export const refreshJournalPath = (root) =>
  path.resolve(root, git(root, "rev-parse", "--git-path", JOURNAL_NAME));

const isRecord = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

export const isJournalForHead = (journal, head) =>
  Boolean(journal) && journal.head === head && isRecord(journal.baseline) && isRecord(journal.checkpoint);

export const isRefreshActiveFor = (destination) => {
  try {
    const gitOptions = { stdio: ["ignore", "pipe", "ignore"], encoding: "utf8" };
    const [root, journalPath, head] = execFileSync(
      "git",
      ["rev-parse", "--show-toplevel", "--path-format=absolute", "--git-path", JOURNAL_NAME, "HEAD"],
      { cwd: path.dirname(destination), ...gitOptions }
    )
      .trim()
      .split(/\r?\n/);
    const relative = path.relative(root, path.resolve(destination));
    if (
      !root ||
      !journalPath ||
      !head ||
      !relative ||
      relative === ".." ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative)
    ) {
      return false;
    }
    return isJournalForHead(JSON.parse(fs.readFileSync(journalPath, "utf8")), head);
  } catch {
    return false;
  }
};
