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
  "price", "priceDetails", "cta", "ctaExtend", "emailHint", "emailHintNoEmail",
  "altCodeToggle", "altCodeHint", "codeUnavailable", "codeUnavailableNoEmail", "waiting",
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

  it("keeps the prescribed English lead price and GBP payment policy", () => {
    const price = stringOf(english, "price");
    expect(price).toContain("£");
    expect(price).toBe("£1 a month. Each £1 you tip adds a month, and later tips extend your access.");
    const details = stringOf(english, "priceDetails");
    expect(details).toMatch(/eligible GBP tips/i);
    expect(details).toMatch(/whole £1/i);
    expect(details).toMatch(/120 months per tip/i);
    expect(details).toMatch(/fractions add no months/i);
    expect(details).toMatch(/£121 or more/i);
    expect(details).toMatch(/other currencies/i);
    expect(details).toMatch(/need review and grant no Premium automatically/i);
    expect(details.match(/[.!?](?:\s|$)/g)).toHaveLength(2);
    expect(price).not.toContain("{{");
  });

  it.each(Object.entries(locales))("%s has localized price details", (path, data) => {
    const price = stringOf(data.premium, "price");
    expect(price, path).not.toContain("{{");
    expect(stringOf(data.premium, "priceDetails"), path).not.toContain("{{");
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

  it("uses public releases and latest published data without a schedule claim", () => {
    for (const [path, data] of Object.entries(locales)) {
      const feature = data.premium.features.updated;
      expect(`${path} ${feature.free} ${feature.premium} ${feature.description}`)
        .toMatch(/public|öffentlich|públic|publi|pubbl|公開|公[開开]|공개/i);
      expect(`${feature.free} ${feature.premium} ${feature.description}`)
        .not.toMatch(/daily|weekly|täglich|wöchentlich|diario|semanal|quotidien|hebdomadaire|毎日|週間|매일|매주|每日|每週/i);
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
