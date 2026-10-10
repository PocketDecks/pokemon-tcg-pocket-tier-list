export const LOCALE_PREFIXES: Record<string, string>;
export const ROUTE_LOCALES: string[];
export const localeRoute: (locale: string, route: string) => string;
export const prefixedLocale: (pathname: string) => string | null;
export const splitLocale: (pathname: string) => { locale: string; rest: string };
