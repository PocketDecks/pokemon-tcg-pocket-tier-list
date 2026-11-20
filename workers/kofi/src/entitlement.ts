import {
  ENTITLEMENT_COLLECTION,
  entitlementStatus,
  isSafeUid,
} from "../../../scripts/entitlement-contract.mjs";
import type { ExistingEntitlement } from "./decision";
import type { DocumentWrite } from "./firestore";

export { entitlementStatus, isSafeUid };

const EXPIRED_MS = 0;

const expiryOf = (value: unknown): number | null => {
  if (value === undefined || value === null) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.getTime();
  return EXPIRED_MS;
};

export const toEntitlement = (
  document: Record<string, unknown> | null,
): ExistingEntitlement | null => {
  if (!document) return null;
  return { premium: document.premium === true, expiresAtMs: expiryOf(document.expiresAt) };
};

export const entitlementPath = (uid: string): string => `${ENTITLEMENT_COLLECTION}/${uid}`;

/**
 * The one write both grant paths use. It merges, so any field it does not set
 * is left as it is.
 */
export const entitlementWrite = (
  uid: string,
  expiresAt: Date,
  source: string,
  now: Date,
  email: string | null = null,
): DocumentWrite => ({
  kind: "merge",
  path: entitlementPath(uid),
  fields: { premium: true, source, expiresAt, updatedAt: now, ...(email ? { email } : {}) },
});
