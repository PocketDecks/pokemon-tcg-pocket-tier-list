import { entitlementStatus } from "../../../scripts/entitlement-contract.mjs";
import { addCalendarMonths } from "./months";

export type PaymentStatus = "granted" | "unmatched" | "needs-review" | "already-lifetime";

export interface ExistingEntitlement {
  premium: boolean;
  expiresAtMs: number | null;
}

export type GrantDecision =
  | { status: "granted"; expiresAt: Date }
  | { status: "already-lifetime" };

export const decideGrant = (input: {
  months: number;
  existing: ExistingEntitlement | null;
  now: Date;
}): GrantDecision => {
  const { months, existing, now } = input;
  const status = entitlementStatus(existing, now.getTime());
  if (status.kind === "lifetime") return { status: "already-lifetime" };
  const base = status.kind === "active" ? new Date(status.expiresAtMs) : now;
  return { status: "granted", expiresAt: addCalendarMonths(base, months) };
};
