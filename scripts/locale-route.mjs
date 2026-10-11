// A new locale also needs its own copy: the deck head tags, deck prerender and
// route metadata assume Japanese for every non-English locale.
export const LOCALE_PREFIXES = { en: "", ja: "/ja" };

export const ROUTE_LOCALES = Object.keys(LOCALE_PREFIXES);

export const localeRoute = (locale, route) => {
  const prefix = LOCALE_PREFIXES[locale] ?? "";
  if (prefix === "") return route;
  return route === "/" ? `${prefix}/` : `${prefix}${route}`;
};

export const routePath = (route) => (route === "/" || route.endsWith("/") ? route : `${route}/`);

export const localizedUrl = (siteUrl, locale, route) =>
  `${siteUrl}${routePath(localeRoute(locale, route))}`;

export const prefixedLocale = (pathname) => {
  const segment = pathname.split("/")[1] ?? "";
  return (
    ROUTE_LOCALES.find(
      (locale) => LOCALE_PREFIXES[locale] !== "" && LOCALE_PREFIXES[locale] === `/${segment}`
    ) ?? null
  );
};

export const splitLocale = (pathname) => {
  const locale = prefixedLocale(pathname);
  if (locale === null) return { locale: "en", rest: pathname };
  const rest = pathname.slice(LOCALE_PREFIXES[locale].length);
  return { locale, rest: rest === "" ? "/" : rest };
};
