import { addCalendarMonths } from "./months";

export type PaymentStatus = "granted" | "unmatched" | "needs-review" | "already-lifetime";

export interface ExistingEntitlement {
  premium: boolean;
  expiresAtMs: number | null;
}

export type GrantDecision =
  | { status: "granted"; expiresAt: Date }
  | { status: "already-lifetime" };

const LIFETIME_THRESHOLD_MS = Date.UTC(2100, 0, 1);

export const decideGrant = (input: {
  months: number;
  existing: ExistingEntitlement | null;
  now: Date;
}): GrantDecision => {
  const { months, existing, now } = input;
  if (existing && existing.premium && existing.expiresAtMs === null) {
    return { status: "already-lifetime" };
  }
  const currentExpiry = existing?.premium ? (existing.expiresAtMs ?? 0) : 0;
  const stacks = currentExpiry > now.getTime();
  if (stacks && currentExpiry > LIFETIME_THRESHOLD_MS) return { status: "already-lifetime" };
  const base = stacks ? new Date(currentExpiry) : now;
  return { status: "granted", expiresAt: addCalendarMonths(base, months) };
};
