export class PremiumAccessError extends Error {
  constructor(name: string) {
    super(`Premium data ${name} is not available to this account`);
    this.name = "PremiumAccessError";
  }
}

const DATA_VERSION_PATTERN = /^[0-9a-f]{16}$/;

let versionRequest: Promise<string> | null = null;

export const resetPremiumDataCache = (): void => {
  versionRequest = null;
};

const requestDataVersion = async (): Promise<string> => {
  const response = await fetch("/data/data-version.json");
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
    versionRequest = requestDataVersion().catch((error: unknown) => {
      versionRequest = null;
      throw error;
    });
  }
  return versionRequest;
};

const sha256Hex = async (text: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const isPermissionDenied = (error: unknown): boolean =>
  (error as { code?: unknown } | null)?.code === "permission-denied";

export const loadPremiumArtefact = async (name: string): Promise<unknown> => {
  const version = await loadDataVersion();
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
    throw new Error(`Premium artefact ${name} is missing for version ${version}`);
  }
  const { payload, sha256 } = snapshot.data() as { payload: string; sha256: string };
  if ((await sha256Hex(payload)) !== sha256) {
    throw new Error(`Premium artefact ${name} failed its hash check`);
  }
  return JSON.parse(payload);
};
