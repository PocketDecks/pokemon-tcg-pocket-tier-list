import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
  getDoc: vi.fn(),
  doc: vi.fn((_db: unknown, ...parts: string[]) => ({ path: parts.join("/") })),
  getFirestore: vi.fn(() => ({})),
}));
vi.mock("firebase/app", () => ({ initializeApp: vi.fn(() => ({ name: "app" })) }));
vi.mock("firebase/auth", () => ({ getAuth: vi.fn(() => ({})), GoogleAuthProvider: vi.fn() }));
vi.mock("firebase/firestore/lite", () => sdk);
vi.mock("../../config/firebase", () => ({ default: { name: "app" } }));
import { loadPremiumArtefact } from "../premium-data";
import { queryClient } from "../query-client";

const A = "aaaaaaaaaaaaaaaa";
const B = "bbbbbbbbbbbbbbbb";
let advertised: string;
let available: string;
let calls: { version: string; fresh: boolean }[];
const payload = JSON.stringify({ recovered: true });
const digest = createHash("sha256").update(payload).digest("hex");

beforeEach(() => {
  queryClient.clear();
  sdk.getDoc.mockReset();
  sdk.doc.mockClear();
  advertised = A;
  available = "none";
  calls = [];
  vi.stubGlobal("fetch", vi.fn((_url: string, options?: RequestInit) => {
    calls.push({ version: advertised, fresh: options?.cache === "no-store" });
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ premium: advertised }) });
  }));
  sdk.getDoc.mockImplementation((reference: { path: string }) =>
    Promise.resolve(reference.path.includes(`/${available}/`)
      ? { exists: (): boolean => true, data: () => ({ payload, sha256: digest }) }
      : { exists: () => false })
  );
});

afterEach(() => {
  queryClient.clear();
  vi.unstubAllGlobals();
});

it("rechecks the manifest after a same-version miss and later publication", async () => {
  const first = await loadPremiumArtefact("best-decks-30d").catch((error: Error) => error.message);
  advertised = B;
  available = B;
  const second = await loadPremiumArtefact("best-decks-30d").then(
    (value) => ({ status: "fulfilled", value }),
    (error: Error) => ({ status: "rejected", message: error.message })
  );
  console.log("QA lifecycle", JSON.stringify({ first, second, calls, documentPaths: sdk.doc.mock.calls.map(([, ...parts]) => parts.join("/")) }));
  expect(second).toEqual({ status: "fulfilled", value: { recovered: true } });
});

it("recovers when the first refresh observes a new available version", async () => {
  let reads = 0;
  sdk.getDoc.mockImplementation((reference: { path: string }) => {
    reads++;
    if (reads === 1) {
      advertised = B;
      available = B;
    }
    return Promise.resolve(reference.path.includes(`/${available}/`)
      ? { exists: (): boolean => true, data: () => ({ payload, sha256: digest }) }
      : { exists: () => false });
  });
  const value = await loadPremiumArtefact("best-decks-30d");
  console.log("QA control", JSON.stringify({ value, calls }));
  expect(value).toEqual({ recovered: true });
});
