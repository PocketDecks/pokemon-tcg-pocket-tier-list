import { useEntitlement } from "../contexts/entitlement-state";

/** null while the account's entitlement is still loading. */
const useIsPremium = (): boolean | null => {
  const { status } = useEntitlement();
  return status === "loading" ? null : status === "supporter";
};

export const usePremiumExpiry = (): number | null => useEntitlement().expiresAt;

export default useIsPremium;
