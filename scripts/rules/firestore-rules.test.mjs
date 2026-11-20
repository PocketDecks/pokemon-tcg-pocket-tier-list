// Runs firestore.rules against the Firestore emulator: `yarn test:rules`.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, beforeEach, describe, test } from "node:test";

import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { Timestamp, collection, deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc, writeBatch } from "firebase/firestore";

import { ENTITLEMENT_COLLECTION } from "../entitlement-contract.mjs";

const rules = readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8");

let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-pocketdecks-rules",
    firestore: { rules },
  });
});

after(async () => {
  await env?.cleanup();
});

const HOUR = 3_600_000;
const future = () => Timestamp.fromMillis(Date.now() + 24 * HOUR);
const past = () => Timestamp.fromMillis(Date.now() - 24 * HOUR);

// Entitlement documents the way the Worker and the grant tool write them.
const entitlements = {
  noExpiry: { premium: true, source: "test", updatedAt: Timestamp.now() },
  nullExpiry: { premium: true, source: "test", expiresAt: null, updatedAt: Timestamp.now() },
  futureExpiry: { premium: true, source: "test", expiresAt: future(), updatedAt: Timestamp.now() },
  expired: { premium: true, source: "test", expiresAt: past(), updatedAt: Timestamp.now() },
  revoked: { premium: false, source: "test", updatedAt: Timestamp.now() },
  badExpiry: { premium: true, source: "test", expiresAt: "2099-01-01", updatedAt: Timestamp.now() },
};

const seed = async (data) => {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    for (const [path, value] of Object.entries(data)) await setDoc(doc(db, path), value);
  });
};

beforeEach(async () => {
  await env.clearFirestore();
});

describe("entitlements/{uid}", () => {
  beforeEach(() => seed({ [`${ENTITLEMENT_COLLECTION}/alice`]: entitlements.noExpiry }));

  test("the owner can read their document", async () => {
    const db = env.authenticatedContext("alice").firestore();
    await assertSucceeds(getDoc(doc(db, ENTITLEMENT_COLLECTION, "alice")));
  });

  test("another user cannot read it", async () => {
    const db = env.authenticatedContext("bob").firestore();
    await assertFails(getDoc(doc(db, ENTITLEMENT_COLLECTION, "alice")));
  });

  test("a signed-out visitor cannot read it", async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, ENTITLEMENT_COLLECTION, "alice")));
  });

  test("no client can write, including the owner", async () => {
    const owner = env.authenticatedContext("alice").firestore();
    const other = env.authenticatedContext("bob").firestore();
    const anon = env.unauthenticatedContext().firestore();
    for (const db of [owner, other, anon]) {
      await assertFails(setDoc(doc(db, ENTITLEMENT_COLLECTION, "alice"), { premium: true }));
      await assertFails(updateDoc(doc(db, ENTITLEMENT_COLLECTION, "alice"), { premium: false }));
      await assertFails(deleteDoc(doc(db, ENTITLEMENT_COLLECTION, "alice")));
    }
    await assertFails(setDoc(doc(owner, ENTITLEMENT_COLLECTION, "new-user"), { premium: true }));
    await assertFails(setDoc(doc(other, ENTITLEMENT_COLLECTION, "bob"), { premium: true }));
  });
});

describe("premiumCodes/{code}", () => {
  beforeEach(() => seed({ "premiumCodes/PD-ABC123": { uid: "alice" } }));

  test("the owner reads their code, others and signed-out visitors do not", async () => {
    await assertSucceeds(getDoc(doc(env.authenticatedContext("alice").firestore(), "premiumCodes/PD-ABC123")));
    await assertFails(getDoc(doc(env.authenticatedContext("bob").firestore(), "premiumCodes/PD-ABC123")));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "premiumCodes/PD-ABC123")));
  });

  test("a user can create a well-formed code for themselves", async () => {
    const db = env.authenticatedContext("bob").firestore();
    await assertSucceeds(setDoc(doc(db, "premiumCodes/PD-ZZZ999"), { uid: "bob" }));
  });

  test("malformed or foreign creates are denied", async () => {
    const db = env.authenticatedContext("bob").firestore();
    await assertFails(setDoc(doc(db, "premiumCodes/PD-ZZZ999"), { uid: "alice" }));
    await assertFails(setDoc(doc(db, "premiumCodes/pd-zzz999"), { uid: "bob" }));
    await assertFails(setDoc(doc(db, "premiumCodes/PD-ZZZ99"), { uid: "bob" }));
    await assertFails(setDoc(doc(db, "premiumCodes/PD-ZZZ999"), { uid: "bob", extra: 1 }));
    await assertFails(setDoc(doc(env.unauthenticatedContext().firestore(), "premiumCodes/PD-ZZZ999"), { uid: "bob" }));
  });

  test("existing codes cannot be overwritten, updated or deleted", async () => {
    const owner = env.authenticatedContext("alice").firestore();
    await assertFails(setDoc(doc(owner, "premiumCodes/PD-ABC123"), { uid: "alice" }));
    await assertFails(updateDoc(doc(owner, "premiumCodes/PD-ABC123"), { uid: "bob" }));
    await assertFails(deleteDoc(doc(owner, "premiumCodes/PD-ABC123")));
  });
});

describe("premiumData/**", () => {
  const paths = ["premiumData/v1", "premiumData/v1/artefacts/best-decks-30d"];

  beforeEach(() =>
    seed({
      "premiumData/v1": { version: "v1" },
      "premiumData/v1/artefacts/best-decks-30d": { json: "{}" },
    })
  );

  const readsFor = async (uid, entitlement) => {
    if (entitlement) await seed({ [`${ENTITLEMENT_COLLECTION}/${uid}`]: entitlement });
    const db = env.authenticatedContext(uid).firestore();
    return paths.map((path) => doc(db, path));
  };

  for (const name of ["noExpiry", "nullExpiry", "futureExpiry"]) {
    test(`readable with an active entitlement (${name})`, async () => {
      for (const ref of await readsFor("payer", entitlements[name])) await assertSucceeds(getDoc(ref));
    });
  }

  for (const name of ["expired", "revoked", "badExpiry"]) {
    test(`denied for ${name}`, async () => {
      for (const ref of await readsFor("payer", entitlements[name])) await assertFails(getDoc(ref));
    });
  }

  test("denied without an entitlement document", async () => {
    for (const ref of await readsFor("nobody", null)) await assertFails(getDoc(ref));
  });

  test("denied when signed out", async () => {
    const db = env.unauthenticatedContext().firestore();
    for (const path of paths) await assertFails(getDoc(doc(db, path)));
  });

  test("another user's entitlement does not help", async () => {
    await seed({ [`${ENTITLEMENT_COLLECTION}/payer`]: entitlements.noExpiry });
    const db = env.authenticatedContext("bob").firestore();
    for (const path of paths) await assertFails(getDoc(doc(db, path)));
  });

  test("clients cannot write, even with an active entitlement", async () => {
    await seed({ [`${ENTITLEMENT_COLLECTION}/payer`]: entitlements.noExpiry });
    const db = env.authenticatedContext("payer").firestore();
    for (const path of paths) {
      await assertFails(setDoc(doc(db, path), { x: 1 }));
      await assertFails(deleteDoc(doc(db, path)));
    }
  });
});

describe("feedback", () => {
  // The same batch src/app/feedback-api.ts commits.
  const google = (uid, token = {}) =>
    env
      .authenticatedContext(uid, {
        email: `${uid}@example.com`,
        email_verified: true,
        firebase: { sign_in_provider: "google.com" },
        ...token,
      })
      .firestore();
  const message = (uid, overrides = {}) => ({
    uid,
    email: null,
    category: "idea",
    message: "A message long enough",
    contactOk: false,
    page: "",
    createdAt: serverTimestamp(),
    ...overrides,
  });
  const submit = (db, uid, overrides = {}) => {
    const batch = writeBatch(db);
    const feedback = doc(collection(db, "feedback"));
    batch.set(feedback, message(uid, overrides));
    batch.set(doc(db, "feedbackThrottle", uid), { lastAt: serverTimestamp(), feedbackId: feedback.id });
    return batch.commit();
  };

  test("a Google user can send one message as themselves", async () => {
    await assertSucceeds(submit(google("alice"), "alice"));
    await assertSucceeds(submit(google("bob"), "bob", { email: "bob@example.com", contactOk: true }));
  });

  for (const category of ["idea", "bug", "data", "other", "stripe", "payment"]) {
    test(`the ${category} category is accepted`, async () => {
      const uid = `sender-${category}`;
      await assertSucceeds(submit(google(uid), uid, { category }));
    });
  }

  test("a second message within the hour is refused", async () => {
    const db = google("alice");
    await assertSucceeds(submit(db, "alice"));
    await assertFails(submit(db, "alice"));
  });

  test("one throttle write cannot cover two messages in the same batch", async () => {
    const db = google("alice");
    const batch = writeBatch(db);
    const first = doc(collection(db, "feedback"));
    batch.set(first, message("alice"));
    batch.set(doc(collection(db, "feedback")), message("alice"));
    batch.set(doc(db, "feedbackThrottle", "alice"), { lastAt: serverTimestamp(), feedbackId: first.id });
    await assertFails(batch.commit());
  });

  test("a throttle write without the message id is refused", async () => {
    const db = google("alice");
    const batch = writeBatch(db);
    batch.set(doc(collection(db, "feedback")), message("alice"));
    batch.set(doc(db, "feedbackThrottle", "alice"), { lastAt: serverTimestamp() });
    await assertFails(batch.commit());
  });

  test("a message sent an hour after the last one is accepted", async () => {
    await seed({ "feedbackThrottle/alice": { lastAt: Timestamp.fromMillis(Date.now() - 2 * HOUR) } });
    await assertSucceeds(submit(google("alice"), "alice"));
  });

  test("bad senders and malformed messages are refused", async () => {
    await assertFails(submit(env.unauthenticatedContext().firestore(), "alice"));
    await assertFails(submit(google("alice", { firebase: { sign_in_provider: "password" } }), "alice"));
    await assertFails(submit(google("alice", { email_verified: false }), "alice"));
    await assertFails(submit(google("alice"), "bob"));
    await assertFails(submit(google("alice"), "alice", { email: "someone@else.com" }));
    await assertFails(submit(google("alice"), "alice", { category: "spam" }));
    await assertFails(submit(google("alice"), "alice", { message: "too short" }));
    await assertFails(submit(google("alice"), "alice", { message: "x".repeat(2001) }));
    await assertFails(submit(google("alice"), "alice", { page: "x".repeat(201) }));
    await assertFails(submit(google("alice"), "alice", { extra: true }));
  });

  test("nobody can read, edit or delete feedback or throttle documents", async () => {
    await seed({ "feedback/f1": { uid: "alice" }, "feedbackThrottle/alice": { lastAt: Timestamp.now() } });
    const db = google("alice");
    await assertFails(getDoc(doc(db, "feedback/f1")));
    await assertFails(updateDoc(doc(db, "feedback/f1"), { message: "changed text here" }));
    await assertFails(deleteDoc(doc(db, "feedback/f1")));
    await assertFails(getDoc(doc(db, "feedbackThrottle/alice")));
    await assertFails(deleteDoc(doc(db, "feedbackThrottle/alice")));
  });
});

describe("everything else", () => {
  test("unmatched collections are denied", async () => {
    await seed({ "other/doc": { a: 1 } });
    const db = env.authenticatedContext("alice").firestore();
    await assertFails(getDoc(doc(db, "other/doc")));
    await assertFails(setDoc(doc(db, "other/doc"), { a: 2 }));
  });

  test("the rules file has exactly the documented match blocks", () => {
    const matches = [...rules.matchAll(/match (\S+) \{/g)].map((m) => m[1]);
    assert.deepEqual(matches, [
      "/databases/{database}/documents",
      "/entitlements/{uid}",
      "/premiumCodes/{code}",
      "/premiumData/{version}",
      "/artefacts/{name}",
      "/feedback/{feedbackId}",
      "/feedbackThrottle/{uid}",
    ]);
  });
});
