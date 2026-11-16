// The page routes, once. App.tsx mounts them, prerender-routes.js renders the
// static pages, generate-sitemap.js lists them and verify-dist-html checks that
// each one resolves on Firebase Hosting.
//
// `element` names a component in App.tsx. `prerender` and `sitemap` mark the
// static pages. `ready` waits for data-backed content before a snapshot, and
// `deckLinks` waits for the deck links on the tier list. Routes with a `:param`
// segment are filled from data and are never prerendered from this table.

export const PAGE_ROUTES = Object.freeze([
  { route: "/", element: "landing", prerender: true, sitemap: true, ready: true },
  { route: "/tier-list", element: "tierList", prerender: true, sitemap: true, deckLinks: true },
  { route: "/cards-list", element: "cardsList", prerender: true, sitemap: true, ready: true },
  { route: "/expansion-list", element: "expansionList", prerender: true, sitemap: true },
  { route: "/expansion-list/:expansionId", element: "expansion", ready: true },
  { route: "/statistics", element: "statistics", prerender: true, sitemap: true, ready: true },
  { route: "/deck", element: "deckFinder", prerender: true, sitemap: true, ready: true },
  { route: "/about", element: "about", prerender: true, sitemap: true },
  { route: "/premium", element: "premium", prerender: true, sitemap: true },
  { route: "/privacy", element: "privacy", prerender: true, sitemap: true },
  { route: "/feedback", element: "feedback" },
  { route: "/deck/:deckId", element: "deck" },
]);

export const PRERENDER_ROUTES = Object.freeze(
  PAGE_ROUTES.filter((entry) => entry.prerender).map((entry) => entry.route)
);

export const SITEMAP_ROUTES = Object.freeze(
  PAGE_ROUTES.filter((entry) => entry.sitemap).map((entry) => entry.route)
);

const segmentsOf = (path) => path.split("/").filter(Boolean);

// The manifest entry that serves a concrete path such as "/expansion-list/a2".
export const pageRouteFor = (path) => {
  const parts = segmentsOf(path);
  return PAGE_ROUTES.find(({ route }) => {
    const pattern = segmentsOf(route);
    return (
      pattern.length === parts.length &&
      pattern.every((segment, index) => segment.startsWith(":") || segment === parts[index])
    );
  });
};
