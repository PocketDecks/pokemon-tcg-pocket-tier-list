import { LIFETIME_THRESHOLD_MS } from "../../scripts/entitlement-contract.mjs";
import useIsPremium, { usePremiumExpiry } from "./use-is-premium";

export type SupporterState = "loading" | "none" | "ended" | "expires" | "lifetime";

export const supporterStateOf = (
  isPremium: boolean | null,
  expiresAt: number | null
): SupporterState => {
  if (isPremium === null) return "loading";
  if (isPremium) {
    return expiresAt === null || expiresAt > LIFETIME_THRESHOLD_MS ? "lifetime" : "expires";
  }
  return expiresAt === null ? "none" : "ended";
};

const useSupporterState = (): { state: SupporterState; expiresAt: number | null } => {
  const isPremium = useIsPremium();
  const expiresAt = usePremiumExpiry();
  return { state: supporterStateOf(isPremium, expiresAt), expiresAt };
};

export default useSupporterState;
