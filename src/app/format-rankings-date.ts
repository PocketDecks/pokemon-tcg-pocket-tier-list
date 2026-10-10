const DATE_LOCALES: Record<string, string> = {
  en: "en-GB",
  de: "de",
  es: "es",
  fr: "fr",
  it: "it",
  ko: "ko",
  ja: "ja",
  pt: "pt",
  ro: "ro",
  "zh-CN": "zh-CN",
  "zh-TW": "zh-TW",
};

const DEFAULT_DATE_LOCALE = "en-GB";

export const formatRankingsDate = (date: Date, language: string): string =>
  date.toLocaleDateString(DATE_LOCALES[language] ?? DEFAULT_DATE_LOCALE, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
