import { queryClient } from "./query-client";
import { premiumCodeKey } from "./query-keys";

const CODE_CHARACTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_ATTEMPTS = 3;
const createCode = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return `PD-${Array.from(bytes, (byte) => CODE_CHARACTERS[byte & 31]).join("")}`;
};

const errorCode = (error: unknown): unknown =>
  (error as { code?: unknown } | null)?.code;

const requestCode = async (uid: string): Promise<string> => {
  const [{ collection, doc, getDocs, getFirestore, query, setDoc, where }, { default: app }] =
    await Promise.all([import("firebase/firestore/lite"), import("../config/firebase")]);
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

// Kept under the Supporter key prefix, so the code is dropped on sign-out and
// account switch with the rest of the account's data.
export const loadPremiumCode = (uid: string): Promise<string> =>
  queryClient.fetchQuery({
    queryKey: premiumCodeKey(uid),
    queryFn: () => requestCode(uid),
    staleTime: Infinity,
  });
