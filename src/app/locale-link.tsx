import { forwardRef, type ComponentProps, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router";
import { localeRoute, routePath, splitLocale } from "./locale-route";

const withTrailingSlash = (to: string) => {
  const delimiter = to.search(/[?#]/);
  const path = delimiter === -1 ? to : to.slice(0, delimiter);
  const rest = delimiter === -1 ? "" : to.slice(delimiter);
  return /\.[a-z0-9]{2,5}$/i.test(path.split("/").at(-1) ?? "")
    ? to
    : `${routePath(path)}${rest}`;
};

const withLocale = (to: string, locale: string) =>
  to.startsWith("/") ? withTrailingSlash(localeRoute(locale, to)) : to;

export const useLocale = (): string => splitLocale(useLocation().pathname).locale;

type LinkProps = ComponentProps<typeof Link>;

export const LocaleLink = forwardRef<HTMLAnchorElement, LinkProps>(
  ({ to, ...rest }, ref) => {
    const locale = useLocale();
    return (
      <Link
        ref={ref}
        to={typeof to === "string" ? withLocale(to, locale) : to}
        {...rest}
      />
    );
  }
);

LocaleLink.displayName = "LocaleLink";

type NavLinkProps = ComponentProps<typeof NavLink> & { children?: ReactNode };

export const LocaleNavLink = forwardRef<HTMLAnchorElement, NavLinkProps>(
  ({ to, ...rest }, ref) => {
    const locale = useLocale();
    return (
      <NavLink
        ref={ref}
        to={typeof to === "string" ? withLocale(to, locale) : to}
        {...rest}
      />
    );
  }
);

LocaleNavLink.displayName = "LocaleNavLink";

export const useLocaleHref = (path: string): string => {
  const locale = useLocale();
  return withLocale(path, locale);
};
