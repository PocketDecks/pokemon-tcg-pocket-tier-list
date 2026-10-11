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

const dateLocale = (language: string) => DATE_LOCALES[language] ?? DEFAULT_DATE_LOCALE;

export const formatRankingsDate = (date: Date, language: string): string =>
  date.toLocaleDateString(dateLocale(language), {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

export const formatRankingsTimestamp = (date: Date, language: string): string =>
  date.toLocaleString(dateLocale(language), {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });
