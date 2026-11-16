import { createContext, useContext } from "react";

export type EntitlementStatus = "loading" | "free" | "supporter";

export interface EntitlementValue {
  status: EntitlementStatus;
  /** Raw expiry of a Supporter grant in ms; null for none or no expiry. */
  expiresAt: number | null;
}

export const EntitlementContext = createContext<EntitlementValue | undefined>(undefined);

export const useEntitlement = (): EntitlementValue => {
  const value = useContext(EntitlementContext);
  if (value === undefined) {
    throw new Error("useEntitlement must be used within an EntitlementProvider");
  }
  return value;
};
