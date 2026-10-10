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

export const SEO_NAMESPACE = "seo";

export const NAMESPACES = ["translation", SEO_NAMESPACE];

// Only a locale that owns a URL prefix is detected here; returning the first
// path segment would make every route look like a language and shadow the
// navigator, breaking the nine locales that have no URL.
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
            // A locale without its own SEO file borrows English rather than failing.
            const load = () =>
                import(`./locales/${language}_${namespace}.json`).then(
                    (resources) => resources.default || resources
                );
            const fallback = () =>
                namespace === SEO_NAMESPACE && language !== "en"
                    ? import("./locales/en_seo.json").then(
                          (resources) => resources.default || resources
                      )
                    : Promise.reject(new Error(`missing ${language}_${namespace}`));

            load()
                .catch(fallback)
                .then((resources) => callback(null, resources))
                .catch((error) => callback(error, null));
        },
    })
    .use(initReactI18next)
    .init({
        supportedLngs: SUPPORTED_LANGUAGES,
        fallbackLng: "en",
        ns: NAMESPACES,
        defaultNS: "translation",
        interpolation: {
            escapeValue: false,
        },
        detection: detectionOptions,
    })
    .catch(console.error);

export default i18n;
