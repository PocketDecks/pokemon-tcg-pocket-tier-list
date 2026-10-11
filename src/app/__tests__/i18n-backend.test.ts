import { describe, expect, it } from "vitest";
import i18n from "../../i18n";

type ReadFn = (
  language: string,
  namespace: string,
  callback: (error: unknown, value: unknown) => void
) => void;

const backendRead = (): ReadFn =>
  (
    i18n.services as unknown as {
      backendConnector: { backend: { read: ReadFn } };
    }
  ).backendConnector.backend.read;

const read = (language: string, namespace: string) =>
  new Promise<{ error: unknown; value: unknown }>((resolve) => {
    backendRead()(language, namespace, (error, value) => resolve({ error, value }));
  });

describe("i18n backend", () => {
  it("falls back to the English SEO file for a locale without one", async () => {
    const { error, value } = await read("de", "seo");
    expect(error).toBeNull();
    expect(value).toMatchObject({ about: expect.any(Object) });
  });

  it("does not call back a second time when the success callback throws", async () => {
    const calls: Array<unknown> = [];
    const swallow = () => {};
    process.on("unhandledRejection", swallow);
    try {
      backendRead()("en", "translation", (error, value) => {
        calls.push(error ?? value);
        if (!error) throw new Error("callback threw");
      });

      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(calls).toHaveLength(1);
    } finally {
      process.off("unhandledRejection", swallow);
    }
  });
});
