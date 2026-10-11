import { useEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router";
import { useTranslation } from "react-i18next";
import { prefixedLocale, splitLocale } from "./locale-route";

// Follows the path, not the detector: crawlers read the served `lang`, and the
// detector can disagree when a visitor's browser language differs.
export const useDocumentLanguage = (): void => {
  const { pathname } = useLocation();
  const navigationType = useNavigationType();
  const { i18n } = useTranslation();
  const previousLocale = useRef(prefixedLocale(pathname));

  useEffect(() => {
    const prefixed = prefixedLocale(pathname);
    // A back or forward out of a locale URL lands on the unprefixed tree,
    // where the visitor never chose a language.
    const leftLocale =
      navigationType === "POP" && previousLocale.current !== null && prefixed === null;
    previousLocale.current = prefixed;
    const { locale } = splitLocale(pathname);
    if ((prefixed !== null || leftLocale) && i18n.language !== locale) {
      i18n.changeLanguage(locale);
    }
    document.documentElement.lang = locale;
  }, [pathname, navigationType, i18n]);
};
