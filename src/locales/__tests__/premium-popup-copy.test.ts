import { describe, expect, it } from "vitest";

type PremiumBlock = Record<string, unknown> & {
  features: Record<string, Record<string, string>>;
};

const locales = import.meta.glob<{ premium: PremiumBlock }>("../*_translation.json", {
  eager: true,
  import: "default",
});

const localeName = (path: string) =>
  path.replace(/^.*\//, "").replace("_translation.json", "");

const NEW_KEYS = [
  "price", "cta", "ctaExtend", "emailHint", "emailHintNoEmail",
  "altCodeToggle", "altCodeHint", "codeUnavailable", "waiting",
  "checkAgain", "copyFailed", "codeLoading",
] as const;

const REMOVED_KEYS = ["benefits", "tipPrompt", "tip", "codeError"] as const;

const COMPARISON_FEATURES = [
  "removeAds", "bestDeckFinder", "exclude", "matchups",
  "filters", "sortBy", "updated", "decks",
] as const;

const placeholders = (value: string) =>
  [...value.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]).sort();

const english = Object.entries(locales).find(([path]) => localeName(path) === "en")![1].premium;

const stringOf = (premium: PremiumBlock, key: string) => {
  const value = premium[key];
  expect(typeof value).toBe("string");
  return value as string;
};

describe("Premium popup copy", () => {
  it("covers all 11 interface locales", () => {
    expect(Object.keys(locales)).toHaveLength(11);
  });

  it("adds every new key in every locale", () => {
    for (const [, data] of Object.entries(locales)) {
      for (const key of NEW_KEYS) {
        expect(typeof data.premium[key]).toBe("string");
        expect((data.premium[key] as string).trim()).not.toBe("");
      }
    }
  });

  it("removes every superseded key in every locale", () => {
    for (const [, data] of Object.entries(locales)) {
      for (const key of REMOVED_KEYS) {
        expect(data.premium[key]).toBeUndefined();
      }
    }
  });

  it.each(Object.entries(locales))("%s keeps the email-first wording", (path, data) => {
    void path;
    const premium = data.premium;
    expect(stringOf(premium, "emailHint")).toContain("{{email}}");
    const noEmail = stringOf(premium, "emailHintNoEmail");
    expect(noEmail).not.toContain("{{email}}");
    expect(noEmail).not.toContain("(");
    expect(stringOf(premium, "emailHint")).toContain("Google");
    expect(stringOf(premium, "cta")).toContain("Ko-fi");
    expect(stringOf(premium, "ctaExtend")).toContain("Ko-fi");
  });

  it.each(Object.entries(locales))("%s keeps the optional code wording", (path, data) => {
    void path;
    const premium = data.premium;
    expect(stringOf(premium, "altCodeHint")).toContain("Ko-fi");
    expect(stringOf(premium, "codeUnavailable")).toContain("Google");
    expect(stringOf(premium, "codeUnavailable")).not.toContain("{{");
    expect(stringOf(premium, "altCodeToggle").trim()).not.toBe("");
    expect(stringOf(premium, "copyFailed").trim()).not.toBe("");
    expect(stringOf(premium, "codeLoading").trim()).not.toBe("");
    expect(stringOf(premium, "waiting").trim()).not.toBe("");
    expect(stringOf(premium, "checkAgain").trim()).not.toBe("");
  });

  it.each(Object.entries(locales))("%s states a plain monthly price", (path, data) => {
    void path;
    const price = stringOf(data.premium, "price");
    expect(price).toContain("1");
    expect(price).toMatch(/£|英镑|英鎊/);
    expect(price).not.toContain("{{");
  });

  it("keeps interpolation placeholders aligned across locales", () => {
    for (const [path, data] of Object.entries(locales)) {
      for (const key of ["emailHint", "emailHintNoEmail", "expires", "refund"]) {
        const expected = placeholders(stringOf(english, key));
        expect([path, key, placeholders(stringOf(data.premium, key))]).toEqual([
          path, key, expected,
        ]);
      }
    }
  });

  it("keeps the comparison feature data in every locale", () => {
    for (const [, data] of Object.entries(locales)) {
      for (const key of COMPARISON_FEATURES) {
        const feature = data.premium.features[key];
        expect(feature).toBeDefined();
        for (const field of ["title", "description", "free", "premium"]) {
          expect(typeof feature[field]).toBe("string");
          expect(feature[field].trim()).not.toBe("");
        }
      }
    }
  });

  it("contains no removed payment processor copy", () => {
    for (const [, data] of Object.entries(locales)) {
      const values = Object.values(data.premium)
        .filter((value): value is string => typeof value === "string")
        .join(" ");
      expect(values).not.toMatch(/stripe/i);
    }
  });
});
