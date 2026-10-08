// During the postbuild route prerender, c15t portals <ConsentBanner/> to
// document.body, outside #root. The client uses createRoot (not hydrateRoot),
// so it never adopts that prerendered markup and a second, handler-less banner
// is frozen on screen forever (and on reload-with-consent-stored it is the ONLY
// copy, so Accept/Reject/Personalise do nothing). Skip the banner while the
// prerenderer drives the page so it stays out of the static HTML; the live
// client still renders it. Ads are skipped for the same reason: the static
// HTML must not depend on the build machine's region or consent policy.
export const isPrerender =
  typeof navigator !== "undefined" && navigator.userAgent === "prerender-routes";
