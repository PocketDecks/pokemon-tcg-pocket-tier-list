import { describe, it, expect } from "vitest";
import en from "../en_translation.json";
import de from "../de_translation.json";
import es from "../es_translation.json";
import fr from "../fr_translation.json";
import itTranslation from "../it_translation.json";
import ja from "../ja_translation.json";
import ko from "../ko_translation.json";
import pt from "../pt_translation.json";
import ro from "../ro_translation.json";
import zhCN from "../zh-CN_translation.json";
import zhTW from "../zh-TW_translation.json";

const locales: Record<string, object> = {
  en,
  de,
  es,
  fr,
  it: itTranslation,
  ja,
  ko,
  pt,
  ro,
  "zh-CN": zhCN,
  "zh-TW": zhTW,
};

const canadaNames: Record<string, string> = {
  de: "Kanada",
  en: "Canada",
  es: "Canadá",
  fr: "Canada",
  it: "Canada",
  ja: "カナダ",
  ko: "캐나다",
  pt: "Canadá",
  ro: "Canada",
  "zh-CN": "加拿大",
  "zh-TW": "加拿大",
};

export const flattenKeys = (obj: Record<string, unknown>, prefix = ""): string[] =>
  Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return flattenKeys(value as Record<string, unknown>, path);
    }
    return [path];
  });

describe("translation key parity", () => {
  const englishKeys = flattenKeys(en).sort();

  it.each(Object.entries(locales))(
    "%s has every key that en_translation.json has",
    (_localeName, localeData) => {
      void _localeName;
      const localeKeys = new Set(flattenKeys(localeData as Record<string, unknown>));
      const missing = englishKeys.filter((key) => !localeKeys.has(key));
      expect(missing).toEqual([]);
    }
  );

  it("every locale has no keys that en_translation.json lacks", () => {
    const englishSet = new Set(englishKeys);
    for (const [, localeData] of Object.entries(locales)) {
      const stale = flattenKeys(localeData as Record<string, unknown>).filter(
        (key) => !englishSet.has(key)
      );
      expect(stale).toEqual([]);
    }
  });

  it.each(Object.entries(locales))("%s consent copy names Canada", (locale, localeData) => {
    const consent = (localeData as { privacyPage: { consent: { heading: string; body: string } } })
      .privacyPage.consent;
    expect(consent.heading).toContain(canadaNames[locale]);
    expect(consent.body).toContain(canadaNames[locale]);
  });
});
