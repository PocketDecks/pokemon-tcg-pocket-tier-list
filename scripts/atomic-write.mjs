import fs from "node:fs";
import { randomUUID } from "node:crypto";
import {
  atomicProofName,
  atomicTemporaryName,
  buildAtomicProof,
  isRefreshActiveFor,
} from "./refresh-sidecars.mjs";

export const writeFileAtomic = (destination, contents, { refreshRecovery = false } = {}) => {
  const temporary = atomicTemporaryName(destination, process.pid, randomUUID());
  const owner =
    refreshRecovery && isRefreshActiveFor(destination) ? atomicProofName(temporary) : undefined;
  let ownerCreated = false;
  let temporaryCreated = false;
  let renamed = false;
  try {
    if (owner) {
      const proof = buildAtomicProof({ destination, temporary, contents });
      const ownerFd = fs.openSync(owner, "wx");
      ownerCreated = true;
      try { fs.writeFileSync(ownerFd, proof); } finally { fs.closeSync(ownerFd); }
    }
    const temporaryFd = fs.openSync(temporary, "wx");
    temporaryCreated = true;
    try { fs.writeFileSync(temporaryFd, contents); } finally { fs.closeSync(temporaryFd); }
    fs.renameSync(temporary, destination);
    renamed = true;
    if (owner) fs.rmSync(owner, { force: true });
  } catch (error) {
    if (temporaryCreated && !renamed) fs.rmSync(temporary, { force: true });
    if (ownerCreated && owner) fs.rmSync(owner, { force: true });
    throw error;
  }
};
