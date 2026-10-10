import { useEffect } from "react";
import { useLocation } from "react-router";
import { splitLocale } from "./locale-route";

// Follows the path, not the detector: crawlers read the served `lang`, and the
// detector can disagree when a visitor's browser language differs.
export const useDocumentLanguage = (): void => {
  const { pathname } = useLocation();

  useEffect(() => {
    document.documentElement.lang = splitLocale(pathname).locale;
  }, [pathname]);
};
