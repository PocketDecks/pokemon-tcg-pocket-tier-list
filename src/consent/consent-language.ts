const CONSENT_LANGUAGES: Record<string, string> = {
  en: "en",
  de: "de",
  es: "es",
  fr: "fr",
  it: "it",
  pt: "pt",
  ro: "ro",
  "zh-CN": "zh",
};

export const toConsentLanguage = (appLanguage: string | undefined): string =>
  appLanguage !== undefined && Object.hasOwn(CONSENT_LANGUAGES, appLanguage)
    ? CONSENT_LANGUAGES[appLanguage]
    : "en";
