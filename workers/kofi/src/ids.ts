import { MAX_MONTHS } from "./months";

// Payment ids become Firestore document ids, so they stay short and plain.
const PAYMENT_ID = /^[A-Za-z0-9_-]{1,128}$/;
// Firestore reserves ids of the form __name__.
const RESERVED_ID = /^__.*__$/;

export const isValidPaymentId = (id: string): boolean =>
  PAYMENT_ID.test(id) && !RESERVED_ID.test(id);

export const isValidMonths = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= MAX_MONTHS;
