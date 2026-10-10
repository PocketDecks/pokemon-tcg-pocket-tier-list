import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { prefixedLocale } from "./app/locale-route";

export const SUPPORTED_LANGUAGES = [
    "en",
    "de",
    "es",
    "fr",
    "it",
    "ko",
    "ja",
    "pt",
    "ro",
    "zh-CN",
    "zh-TW",
];

/**
 * Resolves the language from the URL. Only a locale that owns a URL prefix can
 * be detected this way, so an unprefixed route returns null and the navigator
 * detector still decides. Returning the first path segment instead would make
 * every route look like a language and shadow the navigator entirely, which
 * would break the nine locales that have no URL.
 */
export const createLocaleDetector = () => {
    const detector = new LanguageDetector();
    detector.addDetector({
        name: "pathLocale",
        lookup() {
            return prefixedLocale(window.location.pathname) ?? undefined;
        },
    });
    return detector;
};

export const detectionOptions = {
    order: ["pathLocale", "navigator"],
    caches: [],
};

i18n
    .use(createLocaleDetector())
    .use({
        type: "backend",
        read(
            language: string,
            namespace: string,
            callback: (errorValue: unknown, ret: unknown) => void
        ) {
            import(`./locales/${language}_${namespace}.json`)
                .then((resources) => callback(null, resources.default || resources))
                .catch((error) => callback(error, null));
        },
    })
    .use(initReactI18next)
    .init({
        supportedLngs: SUPPORTED_LANGUAGES,
        fallbackLng: "en",
        interpolation: {
            escapeValue: false,
        },
        detection: detectionOptions,
    })
    .catch(console.error);

export default i18n;
