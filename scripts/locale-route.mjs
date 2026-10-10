/**
 * The single locale URL formula. English is the unprefixed default; every other
 * shipped locale lives under its own prefix. Authored as ESM so src/ can import
 * it directly; the build scripts require() it.
 */
export const LOCALE_PREFIXES = { en: "", ja: "/ja" };

export const ROUTE_LOCALES = Object.keys(LOCALE_PREFIXES);

export const localeRoute = (locale, route) => {
  const prefix = LOCALE_PREFIXES[locale] ?? "";
  if (prefix === "") return route;
  return route === "/" ? `${prefix}/` : `${prefix}${route}`;
};

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
