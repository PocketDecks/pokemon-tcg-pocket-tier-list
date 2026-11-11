import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";

interface EntitlementState {
  premium: boolean;
  expiresAt: number | null;
}

const MAX_TIMEOUT = 2_147_483_647;

const getEntitlement = async (uid: string): Promise<EntitlementState> => {
  const { doc, getDoc, getFirestore } = await import("firebase/firestore");
  const { default: app } = await import("../config/firebase");
  const snapshot = await getDoc(doc(getFirestore(app), "entitlements", uid));
  if (!snapshot.exists()) return { premium: false, expiresAt: null };
  const data = snapshot.data() as { premium?: unknown; expiresAt?: unknown } | undefined;
  if (data?.premium !== true) return { premium: false, expiresAt: null };

  const expiresAt = data.expiresAt;
  if (expiresAt === undefined || expiresAt === null) return { premium: true, expiresAt: null };
  if (typeof expiresAt !== "object" || expiresAt === null) {
    return { premium: false, expiresAt: null };
  }
  const toMillis = (expiresAt as { toMillis?: unknown }).toMillis;
  if (typeof toMillis !== "function") return { premium: false, expiresAt: null };
  const millis = toMillis.call(expiresAt);
  return Number.isFinite(millis)
    ? { premium: true, expiresAt: millis as number }
    : { premium: false, expiresAt: null };
};

const useEntitlement = () => {
  const { user, loading } = useAuth();
  const entitlement = useQuery<EntitlementState, Error>({
    queryKey: ["entitlement", user?.uid ?? null],
    enabled: !loading && !!user,
    retry: false,
    queryFn: () => getEntitlement(user!.uid),
  });
  return { entitlement, user, loading };
};

const grantsAccess = (entitlement: EntitlementState | undefined): boolean =>
  !!entitlement?.premium &&
  (entitlement.expiresAt === null || entitlement.expiresAt > Date.now());

const useIsPremium = () => {
  const { entitlement, user, loading } = useEntitlement();
  const [now, setNow] = useState<number | null>(null);
  const expiresAt = entitlement.data?.premium ? entitlement.data.expiresAt : null;

  useEffect(() => {
    if (now === null) {
      setNow(Date.now());
      return;
    }
    if (expiresAt === null || expiresAt <= now) return;
    const delay = expiresAt - Date.now();
    if (delay <= 0) {
      setNow(Date.now());
      return;
    }
    const timer = setTimeout(() => setNow(Date.now()), Math.min(delay, MAX_TIMEOUT));
    return () => clearTimeout(timer);
  }, [expiresAt, now, user?.uid]);

  useEffect(() => {
    if (entitlement.error) console.error(entitlement.error);
  }, [entitlement.error]);

  if (loading) return null;
  if (!user) return false;
  if (entitlement.error) return false;
  if (entitlement.data) return grantsAccess(entitlement.data);
  return entitlement.isPending ? null : false;
};

export const usePremiumExpiry = (): number | null => {
  const { entitlement, user, loading } = useEntitlement();
  if (loading || !user) return null;
  return entitlement.data?.expiresAt ?? null;
};

export default useIsPremium;
