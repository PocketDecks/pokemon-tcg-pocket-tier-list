import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ENTITLEMENT_COLLECTION,
  entitlementStatus,
  grantsAccess,
  type DecodedEntitlement,
} from "../../scripts/entitlement-contract.mjs";
import { entitlementKey } from "../app/query-keys";
import { useAuth } from "./AuthContext";
import {
  EntitlementContext,
  type EntitlementStatus,
  type EntitlementValue,
} from "./entitlement-state";

export { useEntitlement } from "./entitlement-state";

const MAX_TIMEOUT = 2_147_483_647;

const NO_ENTITLEMENT: DecodedEntitlement = { premium: false, expiresAtMs: null };

const getEntitlement = async (uid: string): Promise<DecodedEntitlement> => {
  const { doc, getDoc, getFirestore } = await import("firebase/firestore/lite");
  const { default: app } = await import("../config/firebase");
  const snapshot = await getDoc(doc(getFirestore(app), ENTITLEMENT_COLLECTION, uid));
  if (!snapshot.exists()) return NO_ENTITLEMENT;
  const data = snapshot.data() as { premium?: unknown; expiresAt?: unknown } | undefined;
  if (data?.premium !== true) return NO_ENTITLEMENT;

  const expiresAt = data.expiresAt;
  if (expiresAt === undefined || expiresAt === null) return { premium: true, expiresAtMs: null };
  if (typeof expiresAt !== "object") return NO_ENTITLEMENT;
  const toMillis = (expiresAt as { toMillis?: unknown }).toMillis;
  if (typeof toMillis !== "function") return NO_ENTITLEMENT;
  const millis = toMillis.call(expiresAt);
  return Number.isFinite(millis) ? { premium: true, expiresAtMs: millis as number } : NO_ENTITLEMENT;
};

const statusOf = (data: DecodedEntitlement): EntitlementStatus =>
  grantsAccess(entitlementStatus(data, Date.now())) ? "supporter" : "free";

/**
 * The one reader of the signed-in account's Supporter entitlement. It runs the
 * query, arms the single timer that ends access at the expiry, and reports a
 * failed read once.
 */
export const EntitlementProvider = ({ children }: { children: ReactNode }) => {
  const { user, loading } = useAuth();
  const entitlement = useQuery<DecodedEntitlement, Error>({
    queryKey: entitlementKey(user?.uid ?? null),
    enabled: !loading && !!user,
    retry: false,
    staleTime: 30_000,
    queryFn: () => getEntitlement(user!.uid),
  });
  const [now, setNow] = useState<number>(() => Date.now());
  const data = entitlement.data;
  const readAt = entitlement.dataUpdatedAt;
  const expiresAtMs = data?.premium ? data.expiresAtMs : null;

  useEffect(() => {
    if (expiresAtMs === null || expiresAtMs <= now) return;
    const delay = expiresAtMs - Date.now();
    if (delay <= 0) {
      setNow(Date.now());
      return;
    }
    const timer = setTimeout(() => setNow(Date.now()), Math.min(delay, MAX_TIMEOUT));
    return () => clearTimeout(timer);
    // A fresh read re-checks the clock and re-arms the timer, even when the
    // grant came back unchanged.
  }, [expiresAtMs, now, readAt, user?.uid]);

  useEffect(() => {
    if (entitlement.error) console.error(entitlement.error);
  }, [entitlement.error]);

  let status: EntitlementStatus;
  if (loading) status = "loading";
  else if (!user) status = "free";
  else if (data) status = statusOf(data);
  else if (entitlement.error) status = "free";
  else status = entitlement.isPending ? "loading" : "free";

  const expiresAt = loading || !user ? null : (data?.expiresAtMs ?? null);

  const value = useMemo<EntitlementValue>(() => ({ status, expiresAt }), [status, expiresAt]);

  return <EntitlementContext.Provider value={value}>{children}</EntitlementContext.Provider>;
};
