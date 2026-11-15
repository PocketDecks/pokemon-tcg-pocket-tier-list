import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const firestore = vi.hoisted(() => ({
  collection: vi.fn((_db: unknown, name: string) => ({ name })),
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join("/") })),
  getDocs: vi.fn(),
  getFirestore: vi.fn(() => ({ kind: "db" })),
  query: vi.fn((...args: unknown[]) => args),
  setDoc: vi.fn(),
  where: vi.fn((...args: unknown[]) => args),
}));

vi.mock("firebase/firestore", () => firestore);
vi.mock("../../config/firebase", () => ({ __esModule: true, default: { name: "app" } }));

import { loadPremiumCode, resetPremiumCodeCache } from "../premium-code";
import { extractCode } from "../../../workers/kofi/src/codes";

const stored = (id: string) => ({ docs: [{ id }] });
const permissionDenied = () => Object.assign(new Error("denied"), { code: "permission-denied" });

beforeEach(() => {
  resetPremiumCodeCache();
  firestore.getDocs.mockResolvedValue({ docs: [] });
  firestore.setDoc.mockResolvedValue(undefined);
  vi.spyOn(crypto, "getRandomValues").mockImplementation((bytes) => {
    (bytes as Uint8Array).fill(0);
    return bytes;
  });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("loadPremiumCode", () => {
  it("returns a stored code unchanged and caches it", async () => {
    firestore.getDocs.mockResolvedValue(stored("PD-ABC234"));

    await expect(loadPremiumCode("user-1")).resolves.toBe("PD-ABC234");
    await expect(loadPremiumCode("user-1")).resolves.toBe("PD-ABC234");
    expect(firestore.getDocs).toHaveBeenCalledTimes(1);
    expect(firestore.setDoc).not.toHaveBeenCalled();
  });

  it("creates one valid code when none is stored and matches the Worker parser", async () => {
    await expect(loadPremiumCode("user-1")).resolves.toBe("PD-AAAAAA");

    const [reference, data] = firestore.setDoc.mock.calls[0];
    expect(reference).toEqual({ path: "premiumCodes/PD-AAAAAA" });
    expect(reference.path.match(/^premiumCodes\/(PD-[A-Z0-9]{6})$/)?.[1]).toBe("PD-AAAAAA");
    expect(data).toEqual({ uid: "user-1" });
    expect(extractCode("Thanks for the tip! PD-AAAAAA")).toBe("PD-AAAAAA");
  });

  it("matches a generated code after it is pasted in lower case", async () => {
    const code = await loadPremiumCode("user-1");
    expect(extractCode(`Thanks for the tip! ${code.toLowerCase()}`)).toBe(code);
  });

  it("ignores a generated code glued to another letter in lower case", async () => {
    const code = await loadPremiumCode("user-1");
    expect(extractCode(`x${code.toLowerCase()}`)).toBeNull();
  });

  it("retries a create collision with a fresh code", async () => {
    let call = 0;
    vi.spyOn(crypto, "getRandomValues").mockImplementation((bytes) => {
      (bytes as Uint8Array).fill(call++ === 0 ? 0 : 1);
      return bytes;
    });
    firestore.setDoc.mockRejectedValueOnce(permissionDenied());

    await expect(loadPremiumCode("user-1")).resolves.toBe("PD-BBBBBB");
    expect(firestore.setDoc).toHaveBeenCalledTimes(2);
    expect(firestore.setDoc.mock.calls.map(([reference]) => reference.path)).toEqual([
      "premiumCodes/PD-AAAAAA",
      "premiumCodes/PD-BBBBBB",
    ]);
    for (const [reference] of firestore.setDoc.mock.calls) {
      expect(reference.path).toMatch(/^premiumCodes\/PD-[A-Z0-9]{6}$/);
    }
  });

  it("surfaces an error after three failed creates", async () => {
    const failure = permissionDenied();
    firestore.setDoc.mockRejectedValue(failure);

    await expect(loadPremiumCode("user-1")).rejects.toBe(failure);
    expect(firestore.setDoc).toHaveBeenCalledTimes(3);
  });

  it("deduplicates simultaneous loads per user and isolates users", async () => {
    firestore.getDocs.mockImplementation(async (reference: unknown[]) => ({
      docs: [{ id: (reference[1] as string[])[2] === "user-1" ? "PD-AAAAAA" : "PD-BBBBBB" }],
    }));

    await expect(Promise.all([loadPremiumCode("user-1"), loadPremiumCode("user-1")])).resolves.toEqual([
      "PD-AAAAAA",
      "PD-AAAAAA",
    ]);
    await expect(loadPremiumCode("user-2")).resolves.toBe("PD-BBBBBB");
    expect(firestore.getDocs).toHaveBeenCalledTimes(2);
    expect(firestore.query).toHaveBeenNthCalledWith(1, expect.anything(), ["uid", "==", "user-1"]);
    expect(firestore.query).toHaveBeenNthCalledWith(2, expect.anything(), ["uid", "==", "user-2"]);
  });

  it("does not cache a request that completes after reset", async () => {
    let resolveQuery!: (value: ReturnType<typeof stored>) => void;
    firestore.getDocs.mockImplementationOnce(() => new Promise((resolve) => (resolveQuery = resolve)));
    const oldRequest = loadPremiumCode("user-1");
    await vi.waitFor(() => expect(resolveQuery).toBeTypeOf("function"));
    resetPremiumCodeCache();
    firestore.getDocs.mockResolvedValue(stored("PD-NEW234"));
    await expect(loadPremiumCode("user-1")).resolves.toBe("PD-NEW234");
    resolveQuery(stored("PD-OLD234"));
    await expect(oldRequest).resolves.toBe("PD-OLD234");
    expect(firestore.getDocs).toHaveBeenCalledTimes(2);
    await expect(loadPremiumCode("user-1")).resolves.toBe("PD-NEW234");
    expect(firestore.getDocs).toHaveBeenCalledTimes(2);
  });
});
