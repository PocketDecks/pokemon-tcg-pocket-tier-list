import { parseAmountPence } from "./months";

export interface KofiPayment {
  verificationToken: string;
  id: string;
  type: string;
  fromName: string;
  message: string;
  amount: string;
  amountPence: number;
  email: string;
  currency: string;
  timestamp: string;
  isSubscriptionPayment: boolean;
}

const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const RESERVED_ID = /^__.*__$/;

const text = (value: unknown): string | null => (typeof value === "string" ? value : null);

export const parseKofiPayload = (body: string): KofiPayment | null => {
  const data = new URLSearchParams(body).get("data");
  if (data === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;

  const verificationToken = text(record.verification_token);
  const amount = text(record.amount);
  const currency = text(record.currency);
  const id = text(record.kofi_transaction_id) || text(record.message_id);
  if (!verificationToken || !amount || !currency || !id) return null;
  if (!SAFE_ID.test(id) || RESERVED_ID.test(id)) return null;

  const amountPence = parseAmountPence(amount);
  if (amountPence === null) return null;

  return {
    verificationToken,
    id,
    type: text(record.type) ?? "",
    fromName: text(record.from_name) ?? "",
    message: text(record.message) ?? "",
    amount,
    amountPence,
    email: text(record.email) ?? "",
    currency,
    timestamp: text(record.timestamp) ?? "",
    isSubscriptionPayment: record.is_subscription_payment === true,
  };
};
