const CODE_CHARACTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_ATTEMPTS = 3;
const codes = new Map<string, string>();
const requests = new Map<string, Promise<string>>();
let cacheGeneration = 0;

export const resetPremiumCodeCache = (): void => {
  cacheGeneration += 1;
  codes.clear();
  requests.clear();
};

const createCode = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return `PD-${Array.from(bytes, (byte) => CODE_CHARACTERS[byte & 31]).join("")}`;
};

const errorCode = (error: unknown): unknown =>
  (error as { code?: unknown } | null)?.code;

const requestCode = async (uid: string): Promise<string> => {
  const [{ collection, doc, getDocs, getFirestore, query, setDoc, where }, { default: app }] =
    await Promise.all([import("firebase/firestore"), import("../config/firebase")]);
  const database = getFirestore(app);
  const existing = await getDocs(query(collection(database, "premiumCodes"), where("uid", "==", uid)));
  if (existing.docs.length > 0) return existing.docs[0].id;

  let failure: unknown;
  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
    const code = createCode();
    try {
      await setDoc(doc(database, "premiumCodes", code), { uid });
      return code;
    } catch (error) {
      failure = error;
      if (errorCode(error) !== "permission-denied" && errorCode(error) !== "already-exists") {
        throw error;
      }
    }
  }
  throw failure;
};

export const loadPremiumCode = (uid: string): Promise<string> => {
  const cached = codes.get(uid);
  if (cached) return Promise.resolve(cached);
  const pending = requests.get(uid);
  if (pending) return pending;

  const generation = cacheGeneration;
  const request = requestCode(uid).then((code) => {
    if (cacheGeneration === generation && requests.get(uid) === request) codes.set(uid, code);
    return code;
  }).finally(() => {
    if (requests.get(uid) === request) requests.delete(uid);
  });
  requests.set(uid, request);
  return request;
};
