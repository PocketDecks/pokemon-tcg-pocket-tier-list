export const ENTITLEMENT_COLLECTION: "entitlements";
export const UID_PATTERN: RegExp;
export const isSafeUid: (uid: unknown) => uid is string;
export const LIFETIME_THRESHOLD_MS: number;

export interface DecodedEntitlement {
  premium: boolean;
  expiresAtMs: number | null;
}

export type EntitlementStatus =
  | { kind: "none" }
  | { kind: "expired" }
  | { kind: "lifetime" }
  | { kind: "active"; expiresAtMs: number };

export const entitlementStatus: (
  entitlement: DecodedEntitlement | null | undefined,
  nowMs: number
) => EntitlementStatus;

export const grantsAccess: (status: EntitlementStatus) => boolean;
