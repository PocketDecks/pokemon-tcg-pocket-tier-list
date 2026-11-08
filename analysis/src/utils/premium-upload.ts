import { sha256Hex } from "./premium-artefacts";

export const PREMIUM_COLLECTION = "premiumData";
export const ARTEFACT_SUBCOLLECTION = "artefacts";
export const DEFAULT_KEEP_VERSIONS = 5;
export const DEFAULT_MAX_BYTES = 900_000;

export interface ExistingVersion {
  version: string;
  createdAt: number;
}

export interface PremiumUploadPlan {
  artefactWrites: { path: string; data: { payload: string; sha256: string } }[];
  versionWrite: { path: string; data: { artefacts: Record<string, string> } };
  deleteVersions: string[];
}

export const planPremiumUpload = ({
  files,
  version,
  existing,
  keep = DEFAULT_KEEP_VERSIONS,
  maxBytes = DEFAULT_MAX_BYTES,
}: {
  files: Record<string, string>;
  version: string;
  existing: readonly ExistingVersion[];
  keep?: number;
  maxBytes?: number;
}): PremiumUploadPlan => {
  const names = Object.keys(files).sort();

  for (const name of names) {
    const bytes = Buffer.byteLength(files[name], "utf8");
    if (bytes > maxBytes) {
      throw new Error(`${name} is ${bytes} bytes, the limit is ${maxBytes}`);
    }
  }

  const hashes = Object.fromEntries(names.map((name) => [name, sha256Hex(files[name])]));
  const artefactWrites = names.map((name) => ({
    path: `${PREMIUM_COLLECTION}/${version}/${ARTEFACT_SUBCOLLECTION}/${name}`,
    data: { payload: files[name], sha256: hashes[name] },
  }));

  const others = existing
    .filter((entry) => entry.version !== version)
    .sort((a, b) => b.createdAt - a.createdAt);
  const deleteVersions = others
    .slice(Math.max(keep - 1, 0))
    .reverse()
    .map((entry) => entry.version);

  return {
    artefactWrites,
    versionWrite: { path: `${PREMIUM_COLLECTION}/${version}`, data: { artefacts: hashes } },
    deleteVersions,
  };
};
