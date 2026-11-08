import { vi } from "vitest";
import { createReceiver } from "../src/handler";
import { createFakeGoogle } from "./fake-google";
import { generateTestKeys, serviceAccountJson } from "./keys";

export const TOKEN = "kofi-secret-token";
export const NOW = new Date("2026-11-08T12:00:00.000Z");

export const keys = await generateTestKeys();
export const serviceAccount = serviceAccountJson(keys.privateKeyPem);

export const payment = (overrides: Record<string, unknown> = {}) => ({
  verification_token: TOKEN,
  message_id: "msg-1",
  timestamp: "2026-11-08T11:59:00Z",
  type: "Donation",
  is_public: true,
  from_name: "Ash Ketchum",
  message: "Thanks for the site",
  amount: "5.00",
  url: "https://ko-fi.com/Home/CoffeeShop?txid=abc",
  email: "ash@example.com",
  currency: "GBP",
  is_subscription_payment: false,
  is_first_subscription_payment: false,
  kofi_transaction_id: "txn-1",
  ...overrides,
});

export const setup = (now: Date = NOW) => {
  let current = now.getTime();
  const google = createFakeGoogle({ publicKey: keys.publicKey, now: () => current });
  const fetchSpy = vi.fn(google.fetch);
  const receive = createReceiver({
    fetch: fetchSpy as unknown as typeof fetch,
    now: () => new Date(current),
  });
  const advance = (milliseconds: number) => {
    current += milliseconds;
  };
  const env = { KOFI_VERIFICATION_TOKEN: TOKEN, FIREBASE_SERVICE_ACCOUNT: serviceAccount };
  const post = (data: unknown, path = "/kofi") =>
    receive(
      new Request(`https://worker.example${path}`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(JSON.stringify(data))}`,
      }),
      env,
    );
  return { google, fetchSpy, receive, env, post, advance };
};
