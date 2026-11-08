import type { ExistingEntitlement } from "./decision";

export const SAFE_UID = /^[A-Za-z0-9]{1,128}$/;

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
