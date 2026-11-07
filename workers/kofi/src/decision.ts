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
  if (existing && existing.premium && existing.expiresAtMs === null) {
    return { status: "already-lifetime" };
  }
  const currentExpiry = existing?.expiresAtMs ?? 0;
  const base = currentExpiry > now.getTime() ? new Date(currentExpiry) : now;
  return { status: "granted", expiresAt: addCalendarMonths(base, months) };
};
