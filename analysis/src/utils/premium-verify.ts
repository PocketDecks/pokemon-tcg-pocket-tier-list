import { PREMIUM_ARTEFACT_NAMES, sha256Hex } from "./premium-artefacts";

export interface PremiumSnapshot {
  version: string;
  versionDocument: { artefacts: Record<string, string> } | null;
  artefacts: Record<string, { payload: string; sha256: string } | null | undefined>;
}

export const checkPremiumVersion = (
  snapshot: PremiumSnapshot,
  expectedNames: readonly string[] = PREMIUM_ARTEFACT_NAMES
): string[] => {
  if (snapshot.versionDocument === null) {
    return [`version ${snapshot.version} is missing`];
  }

  const problems: string[] = [];
  for (const name of expectedNames) {
    const stored = snapshot.artefacts[name];
    if (!stored) {
      problems.push(`artefact ${name} is missing`);
      continue;
    }
    const actual = sha256Hex(stored.payload);
    if (actual !== stored.sha256 || actual !== snapshot.versionDocument.artefacts[name]) {
      problems.push(`artefact ${name} hash mismatch`);
    }
  }
  return problems;
};
