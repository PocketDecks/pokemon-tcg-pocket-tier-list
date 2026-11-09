import { PREMIUM_ARTEFACT_NAMES, premiumVersion, sha256Hex } from "./premium-artefacts";

export interface PremiumSnapshot {
  version: string;
  versionDocument: { artefacts: Record<string, string> } | null;
  artefacts: Record<string, { payload: string; sha256: string } | null | undefined>;
}

export const checkPremiumVersion = (
  snapshot: PremiumSnapshot,
  expectedNames: readonly string[] = PREMIUM_ARTEFACT_NAMES
): string[] => {
  const problems: string[] = snapshot.versionDocument === null ? [`version ${snapshot.version} is missing`] : [];

  const payloads: Record<string, string> = {};
  for (const name of expectedNames) {
    const stored = snapshot.artefacts[name];
    if (stored) payloads[name] = stored.payload;
  }
  if (Object.keys(payloads).length === expectedNames.length) {
    const recomputed = premiumVersion(payloads);
    if (recomputed !== snapshot.version) {
      problems.push(`version ${snapshot.version} does not match the artefacts`);
    }
  }
  for (const name of expectedNames) {
    const stored = snapshot.artefacts[name];
    if (!stored) {
      problems.push(`artefact ${name} is missing`);
      continue;
    }
    const actual = sha256Hex(stored.payload);
    if (actual !== stored.sha256 || (snapshot.versionDocument !== null && actual !== snapshot.versionDocument.artefacts[name])) {
      problems.push(`artefact ${name} hash mismatch`);
    }
  }
  return problems;
};
