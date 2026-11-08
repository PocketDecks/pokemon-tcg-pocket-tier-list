import { describe, expect, it } from "vitest";
import { createFirestoreClient } from "../src/firestore";

describe("createFirestoreClient paths", () => {
  it("encodes each document path segment in read URLs", async () => {
    const urls: string[] = [];
    const client = createFirestoreClient({
      projectId: "demo-project",
      getToken: async () => "token",
      fetch: (async (input: RequestInfo | URL) => {
        urls.push(String(input));
        return new Response(JSON.stringify({ fields: {} }), { status: 200 });
      }) as typeof fetch,
    });
    await client.getDocument("entitlements/ash#1?x");
    expect(urls[0]).toBe(
      "https://firestore.googleapis.com/v1/projects/demo-project/databases/(default)/documents/entitlements/ash%231%3Fx",
    );
  });
});
