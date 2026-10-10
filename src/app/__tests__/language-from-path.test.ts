import { beforeEach, describe, expect, it } from "vitest";
import i18next from "i18next";
import { SUPPORTED_LANGUAGES, createLocaleDetector, detectionOptions } from "../../i18n";

const setLocation = (pathname: string) => {
  window.history.pushState({}, "", pathname);
};

const setNavigatorLanguages = (languages: string[]) => {
  Object.defineProperty(window.navigator, "language", {
    value: languages[0],
    configurable: true,
  });
  Object.defineProperty(window.navigator, "languages", {
    value: languages,
    configurable: true,
  });
};

const resolveLanguage = async () => {
  const instance = i18next.createInstance();
  await instance
    .use(createLocaleDetector())
    .init({
      supportedLngs: SUPPORTED_LANGUAGES,
      fallbackLng: "en",
      resources: Object.fromEntries(
        SUPPORTED_LANGUAGES.map((language) => [language, { translation: { key: language } }])
      ),
      detection: detectionOptions,
    });
  return instance.language;
};

describe("language resolution from the URL path", () => {
  beforeEach(() => {
    setNavigatorLanguages(["en-US"]);
    setLocation("/");
  });

  it("takes the language from a Japanese locale prefix", async () => {
    setLocation("/ja/tier-list/");
    expect(await resolveLanguage()).toBe("ja");
  });

  it("takes the language from a nested Japanese locale prefix", async () => {
    setLocation("/ja/deck/mega-lucario-ex-b3-081/");
    expect(await resolveLanguage()).toBe("ja");
  });

  it("keeps the navigator language on an unprefixed route, as today", async () => {
    setNavigatorLanguages(["ja-JP"]);
    setLocation("/tier-list/");
    expect(await resolveLanguage()).toBe("ja");
  });

  it("falls back to the navigator language on an unprefixed route", async () => {
    setNavigatorLanguages(["de-DE"]);
    setLocation("/tier-list/");
    expect(await resolveLanguage()).toBe("de");
  });

  it("keeps the navigator language for the nine locales without a URL", async () => {
    for (const [tag, expected] of [
      ["ko-KR", "ko"],
      ["zh-TW", "zh-TW"],
      ["pt-BR", "pt"],
      ["ro-RO", "ro"],
    ]) {
      setNavigatorLanguages([tag]);
      setLocation("/");
      expect(await resolveLanguage()).toBe(expected);
    }
  });

  it("does not read a route segment as a locale", async () => {
    setNavigatorLanguages(["de-DE"]);
    setLocation("/tier-list/");
    expect(await resolveLanguage()).toBe("de");
  });

  it("uses English when neither the path nor the navigator resolves", async () => {
    setNavigatorLanguages(["xx-XX"]);
    setLocation("/");
    expect(await resolveLanguage()).toBe("en");
  });
});
