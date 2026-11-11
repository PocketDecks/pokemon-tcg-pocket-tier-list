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
import enSeo from "../en_seo.json";
import jaSeo from "../ja_seo.json";

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

  it("contains no removed payment processor or wind-down copy", () => {
    const localeDataSet = [
      ...Object.entries(locales),
      ["en_seo", enSeo],
      ["ja_seo", jaSeo],
    ];
    for (const [, localeData] of localeDataSet) {
      const strings = Object.values(localeData as Record<string, unknown>);
      const collect = (value: unknown): string[] =>
        typeof value === "string"
          ? [value]
          : value && typeof value === "object"
            ? Object.values(value).flatMap(collect)
            : [];
      expect(collect(strings).join(" ")).not.toMatch(/stripe|wind.?down/i);
    }
  });

  it.each(Object.entries(locales))("%s consent copy names Canada", (locale, localeData) => {
    const consent = (localeData as { privacyPage: { consent: { heading: string; body: string } } })
      .privacyPage.consent;
    expect(consent.heading).toContain(canadaNames[locale]);
    expect(consent.body).toContain(canadaNames[locale]);
  });
});

// Only en and ja ship SEO prose; the other nine fall back to English.
describe("seo namespace key parity", () => {
  it("ja_seo.json has every key that en_seo.json has", () => {
    const englishKeys = new Set(flattenKeys(enSeo as Record<string, unknown>));
    const japaneseKeys = new Set(flattenKeys(jaSeo as Record<string, unknown>));
    expect(englishKeys.size).toBeGreaterThan(0);
    expect([...englishKeys].filter((key) => !japaneseKeys.has(key))).toEqual([]);
  });

  it("ja_seo.json has no keys that en_seo.json lacks", () => {
    const englishKeys = new Set(flattenKeys(enSeo as Record<string, unknown>));
    const stale = flattenKeys(jaSeo as Record<string, unknown>).filter(
      (key) => !englishKeys.has(key)
    );
    expect(stale).toEqual([]);
  });
});

describe("weeklyUpdates copy", () => {
  const MONDAY =
    /monday|montag|lunes|lundi|lunedì|segunda|luni|月曜|월요일|星期一|週一/i;

  const CADENCE: Record<string, RegExp> = {
    en: /four times a week/,
    de: /viermal pro Woche/,
    es: /cuatro veces por semana/,
    fr: /quatre fois par semaine/,
    it: /quattro volte a settimana/,
    ja: /週4回/,
    ko: /주 4회/,
    pt: /quatro vezes por semana/,
    ro: /de patru ori pe săptămână/,
    "zh-CN": /一周更新四次/,
    "zh-TW": /一週更新四次/,
  };

  it.each(Object.entries(locales))("%s says neither Monday nor weekly", (localeName, localeData) => {
    const block = (localeData as { features: { weeklyUpdates: { title: string; description: string } } })
      .features.weeklyUpdates;
    const text = `${block.title} ${block.description}`;
    expect(text).not.toMatch(/weekly/i);
    expect(text).not.toMatch(MONDAY);
    expect(text).toMatch(CADENCE[localeName]);
  });
});
