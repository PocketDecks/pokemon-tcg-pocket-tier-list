import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const firestore = vi.hoisted(() => ({
  getDoc: vi.fn(),
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join("/") })),
  getFirestore: vi.fn(() => ({ kind: "db" })),
}));

const firebase = vi.hoisted(() => ({
  getIdToken: vi.fn(),
  currentUser: { current: null as { getIdToken: (force: boolean) => Promise<string> } | null },
}));

vi.mock("firebase/firestore", () => firestore);
vi.mock("../../config/firebase", () => ({
  __esModule: true,
  default: { name: "app" },
  auth: {
    get currentUser() {
      return firebase.currentUser.current;
    },
  },
}));

import {
  PremiumAccessError,
  loadDataVersion,
  loadPremiumArtefact,
  resetPremiumDataCache,
} from "../premium-data";

const sha256 = async (text: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const snapshot = (payload: string, hash: string) => ({
  exists: () => true,
  data: () => ({ payload, sha256: hash }),
});

const permissionDenied = () => Object.assign(new Error("denied"), { code: "permission-denied" });

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  resetPremiumDataCache();
  firebase.getIdToken.mockResolvedValue("token");
  firebase.currentUser.current = { getIdToken: firebase.getIdToken };
  fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ premium: "abcdef0123456789" }),
  } as unknown as Response);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("loadDataVersion", () => {
  it("reads the premium version from the public data version file", async () => {
    await expect(loadDataVersion()).resolves.toBe("abcdef0123456789");
    expect(fetchSpy).toHaveBeenCalledWith("/data/data-version.json");
  });

  it("fetches the file once however often it is asked", async () => {
    await Promise.all([loadDataVersion(), loadDataVersion()]);
    await loadDataVersion();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("does not remember a failure", async () => {
    fetchSpy.mockResolvedValueOnce({ ok: false, status: 500, statusText: "Boom" } as Response);

    await expect(loadDataVersion()).rejects.toThrow(/data-version\.json: 500 Boom/);
    await expect(loadDataVersion()).resolves.toBe("abcdef0123456789");
  });

  it("rejects a file without a premium version", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ premium: 7 }),
    } as unknown as Response);

    await expect(loadDataVersion()).rejects.toThrow(/premium version/);
  });
});

describe("loadPremiumArtefact", () => {
  it("reads the versioned artefact document and returns the parsed payload", async () => {
    const payload = JSON.stringify([{ name: "deck" }]);
    firestore.getDoc.mockResolvedValue(snapshot(payload, await sha256(payload)));

    await expect(loadPremiumArtefact("best-decks-30d")).resolves.toEqual([{ name: "deck" }]);

    expect(firestore.doc).toHaveBeenCalledWith(
      expect.anything(),
      "premiumData",
      "abcdef0123456789",
      "artefacts",
      "best-decks-30d"
    );
  });

  it("retries once after a forced token refresh on permission-denied", async () => {
    const payload = '{"ok":true}';
    firestore.getDoc
      .mockRejectedValueOnce(permissionDenied())
      .mockResolvedValueOnce(snapshot(payload, await sha256(payload)));

    await expect(loadPremiumArtefact("meta-share-all")).resolves.toEqual({ ok: true });

    expect(firebase.getIdToken).toHaveBeenCalledWith(true);
    expect(firestore.getDoc).toHaveBeenCalledTimes(2);
  });

  it("throws PremiumAccessError when the retry is denied too", async () => {
    firestore.getDoc.mockRejectedValue(permissionDenied());

    await expect(loadPremiumArtefact("meta-share-all")).rejects.toBeInstanceOf(PremiumAccessError);

    expect(firebase.getIdToken).toHaveBeenCalledTimes(1);
    expect(firestore.getDoc).toHaveBeenCalledTimes(2);
  });

  it("throws PremiumAccessError without a retry when nobody is signed in", async () => {
    firebase.currentUser.current = null;
    firestore.getDoc.mockRejectedValue(permissionDenied());

    await expect(loadPremiumArtefact("best-decks-all")).rejects.toBeInstanceOf(PremiumAccessError);

    expect(firestore.getDoc).toHaveBeenCalledTimes(1);
  });

  it("passes other Firestore failures through unchanged", async () => {
    const failure = Object.assign(new Error("offline"), { code: "unavailable" });
    firestore.getDoc.mockRejectedValue(failure);

    await expect(loadPremiumArtefact("best-decks-all")).rejects.toBe(failure);
    expect(firebase.getIdToken).not.toHaveBeenCalled();
  });

  it("throws when the payload does not match its stored hash", async () => {
    firestore.getDoc.mockResolvedValue(snapshot('{"tampered":true}', await sha256("{}")));

    const failure = await loadPremiumArtefact("best-decks-30d").catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toBeInstanceOf(PremiumAccessError);
    expect((failure as Error).message).toMatch(/best-decks-30d.*hash/);
  });

  it("throws when the artefact document does not exist", async () => {
    firestore.getDoc.mockResolvedValue({ exists: () => false });

    await expect(loadPremiumArtefact("best-decks-30d")).rejects.toThrow(/best-decks-30d.*missing/);
  });
});
