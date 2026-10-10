import { forwardRef, type ComponentProps, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router";
import { localeRoute, splitLocale } from "./locale-route";

// A destination written without the locale would drop the visitor out of the
// locale they are reading.
const withLocale = (to: string, locale: string) =>
  to.startsWith("/") ? localeRoute(locale, to) : to;

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
