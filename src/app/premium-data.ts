export class PremiumAccessError extends Error {
  constructor(name: string) {
    super(`Premium data ${name} is not available to this account`);
    this.name = "PremiumAccessError";
  }
}

const DATA_VERSION_PATTERN = /^[0-9a-f]{16}$/;

let versionRequest: Promise<string> | null = null;
let versionRefreshRequest: Promise<string> | null = null;
let versionRequestGeneration = 0;

export const resetPremiumDataCache = (): void => {
  versionRequestGeneration += 1;
  versionRequest = null;
  versionRefreshRequest = null;
};

const requestDataVersion = async (fresh = false): Promise<string> => {
  const response = await (fresh
    ? fetch("/data/data-version.json", { cache: "no-store" })
    : fetch("/data/data-version.json"));
  if (!response.ok) {
    throw new Error(
      `Failed to fetch data-version.json: ${response.status} ${response.statusText}`
    );
  }
  const data: unknown = await response.json();
  const premium = (data as { premium?: unknown } | null)?.premium;
  if (typeof premium !== "string" || !DATA_VERSION_PATTERN.test(premium)) {
    throw new Error("data-version.json has no premium version");
  }
  return premium;
};

export const loadDataVersion = (): Promise<string> => {
  if (versionRequest === null) {
    const generation = versionRequestGeneration;
    versionRequest = requestDataVersion().catch((error: unknown) => {
      if (versionRequestGeneration === generation) versionRequest = null;
      throw error;
    });
  }
  return versionRequest;
};

const refreshDataVersion = (): Promise<string> => {
  if (versionRefreshRequest !== null) return versionRefreshRequest;
  versionRequestGeneration += 1;
  const generation = versionRequestGeneration;
  versionRequest = null;
  const request = requestDataVersion(true).catch((error: unknown) => {
    if (versionRequestGeneration === generation) versionRequest = null;
    throw error;
  });
  versionRequest = request;
  versionRefreshRequest = request;
  void request.then(
    () => {
      if (versionRefreshRequest === request) versionRefreshRequest = null;
    },
    () => {
      if (versionRefreshRequest === request) versionRefreshRequest = null;
    }
  );
  return request;
};

const sha256Hex = async (text: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const isPermissionDenied = (error: unknown): boolean =>
  (error as { code?: unknown } | null)?.code === "permission-denied";

const loadArtefactAtVersion = async (
  name: string,
  version: string
): Promise<{ found: true; value: unknown } | { found: false }> => {
  const [{ doc, getDoc, getFirestore }, { default: app, auth }] = await Promise.all([
    import("firebase/firestore"),
    import("../config/firebase"),
  ]);
  const reference = doc(getFirestore(app), "premiumData", version, "artefacts", name);

  let snapshot;
  try {
    snapshot = await getDoc(reference);
  } catch (error) {
    if (!isPermissionDenied(error)) throw error;
    const user = auth.currentUser;
    if (!user) throw new PremiumAccessError(name);
    await user.getIdToken(true);
    try {
      snapshot = await getDoc(reference);
    } catch (retryError) {
      if (isPermissionDenied(retryError)) throw new PremiumAccessError(name);
      throw retryError;
    }
  }

  if (!snapshot.exists()) {
    return { found: false };
  }
  const { payload, sha256 } = snapshot.data() as { payload: string; sha256: string };
  if ((await sha256Hex(payload)) !== sha256) {
    throw new Error(`Premium artefact ${name} failed its hash check`);
  }
  return { found: true, value: JSON.parse(payload) };
};

export const loadPremiumArtefact = async (name: string): Promise<unknown> => {
  let version = await loadDataVersion();
  let result = await loadArtefactAtVersion(name, version);
  if (result.found) return result.value;

  version = await refreshDataVersion();
  result = await loadArtefactAtVersion(name, version);
  if (!result.found) {
    throw new Error(`Premium artefact ${name} is missing for version ${version}`);
  }
  return result.value;
};
