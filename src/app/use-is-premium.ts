import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";

interface EntitlementState {
  premium: boolean;
  expiresAt: number | null;
}

const getPremiumSubscriptions = async () => {
  const [{ getCurrentUserSubscriptions }, payments] = await Promise.all([
    import("@invertase/firestore-stripe-payments"),
    import("../config/firebase").then(({ getPayments }) => getPayments()),
  ]);
  return getCurrentUserSubscriptions(payments, {
    status: ["active", "trialing", "past_due"],
  });
};

const getEntitlement = async (uid: string): Promise<EntitlementState> => {
  const { doc, getDoc, getFirestore } = await import("firebase/firestore");
  const { default: app } = await import("../config/firebase");
  const snapshot = await getDoc(doc(getFirestore(app), "entitlements", uid));
  if (!snapshot.exists()) return { premium: false, expiresAt: null };
  const data = snapshot.data() as { premium?: unknown; expiresAt?: unknown } | undefined;
  const expiresAt = data?.expiresAt;
  if (expiresAt === undefined || expiresAt === null) {
    return { premium: data?.premium === true, expiresAt: null };
  }
  const toMillis = (expiresAt as { toMillis?: unknown }).toMillis;
  if (typeof toMillis !== "function") return { premium: false, expiresAt: null };
  return { premium: data?.premium === true, expiresAt: toMillis.call(expiresAt) as number };
};

const grantsAccess = (entitlement: EntitlementState | undefined): boolean =>
  !!entitlement &&
  entitlement.premium &&
  (entitlement.expiresAt === null || entitlement.expiresAt > Date.now());

const useIsPremium = () => {
  const { user, loading } = useAuth();
  const enabled = !loading && !!user;

  // Count subscriptions that grant Premium access. "trialing" is essential:
  // new sign-ups start a 7-day free trial, so their subscription status is
  // "trialing" (not "active") until the trial ends and the first invoice is
  // paid. Filtering on "active" alone makes trialing users look non-premium,
  // which re-shows the upsell and sends them back through Stripe checkout,
  // some end up with duplicate subscriptions. "past_due" keeps access during
  // Stripe's payment-retry grace period instead of yanking it on a single
  // failed renewal.
  const subscription = useQuery<boolean, Error>({
    queryKey: ["premium", user?.uid ?? null],
    enabled,
    retry: false,
    queryFn: async () => {
      const subscriptions = await getPremiumSubscriptions();
      return subscriptions.length > 0;
    },
  });

  const entitlement = useQuery<EntitlementState, Error>({
    queryKey: ["entitlement", user?.uid ?? null],
    enabled,
    retry: false,
    queryFn: () => getEntitlement(user!.uid),
  });

  useEffect(() => {
    if (subscription.error) console.error(subscription.error);
  }, [subscription.error]);

  useEffect(() => {
    if (entitlement.error) console.error(entitlement.error);
  }, [entitlement.error]);

  if (loading) return null;
  if (!user) return false;
  if (subscription.data === true || grantsAccess(entitlement.data)) return true;
  if (subscription.isPending || entitlement.isPending) return null;
  return false;
};

export default useIsPremium;
