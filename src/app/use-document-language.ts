import { useEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router";
import { useTranslation } from "react-i18next";
import { prefixedLocale } from "./locale-route";

// Follows the path, not the detector: crawlers read the served `lang`, and the
// detector can disagree when a visitor's browser language differs.
export const useDocumentLanguage = (): void => {
  const { pathname, key } = useLocation();
  const navigationType = useNavigationType();
  const { i18n } = useTranslation();
  const appliedEntry = useRef(key);
  const entryLanguages = useRef(new Map<string, string>());

  useEffect(() => {
    const prefixed = prefixedLocale(pathname);
    // Re-running for the same entry means the visitor chose a language, so only
    // an entry change re-derives it.
    const entered = appliedEntry.current !== key;
    appliedEntry.current = key;
    // A back navigation to an entry this tab already rendered restores the
    // language it was read in; one it never rendered is the English tree left.
    const remembered = entered ? entryLanguages.current.get(key) : undefined;
    const target =
      prefixed ??
      remembered ??
      (entered && navigationType === "POP" ? "en" : i18n.language);
    entryLanguages.current.set(key, target);
    if (target !== i18n.language) i18n.changeLanguage(target);
    document.documentElement.lang = target;
  }, [pathname, key, navigationType, i18n, i18n.language]);
};
