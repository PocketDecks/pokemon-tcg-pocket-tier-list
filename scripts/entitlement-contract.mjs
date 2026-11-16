// The one definition of a Supporter entitlement, shared by the app, the Ko-fi
// Worker and the analysis grant tool. firestore.rules mirrors it, and
// scripts/__tests__/firestore-rules.test.js pins the two together.

export const ENTITLEMENT_COLLECTION = "entitlements";

// Firebase uids are alphanumeric; `_` and `-` cover custom uids. Nothing here
// may contain `/`, so a uid is always a single Firestore path segment.
export const UID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export const isSafeUid = (uid) => typeof uid === "string" && UID_PATTERN.test(uid);

// A grant that ends after this instant is treated as lifetime access.
export const LIFETIME_THRESHOLD_MS = Date.UTC(2100, 0, 1);

/**
 * Classifies a decoded entitlement document.
 * `premium` is the stored flag; `expiresAtMs` is null when `expiresAt` is
 * missing or null (no expiry).
 */
export const entitlementStatus = (entitlement, nowMs) => {
  if (!entitlement || entitlement.premium !== true) return { kind: "none" };
  const { expiresAtMs } = entitlement;
  if (expiresAtMs === null || expiresAtMs > LIFETIME_THRESHOLD_MS) return { kind: "lifetime" };
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs) return { kind: "expired" };
  return { kind: "active", expiresAtMs };
};

export const grantsAccess = (status) => status.kind === "lifetime" || status.kind === "active";
