import { useEffect } from "react";
import { useLocation } from "react-router";
import { splitLocale } from "./locale-route";

/**
 * Keeps the served document's language in step with the URL. Crawlers read the
 * static `lang` attribute, so it has to follow the path rather than the
 * detector, which can disagree when a visitor's browser language differs.
 */
export const useDocumentLanguage = (): void => {
  const { pathname } = useLocation();

  useEffect(() => {
    document.documentElement.lang = splitLocale(pathname).locale;
  }, [pathname]);
};
