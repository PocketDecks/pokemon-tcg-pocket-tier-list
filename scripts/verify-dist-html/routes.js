// scripts/verify-dist-html/routes.js
// App routes resolved against firebase.json and the built files.
const fs = require("fs");
const { LOCALE_PREFIXES } = require("../locale-route.mjs");
const { resolveHosting } = require("../firebase-hosting");
const { PAGE_ROUTES } = require("../routes.mjs");
const { FIREBASE_CONFIG_PATH, posixEntry } = require("./shared");

// Every page route under each locale prefix in LOCALE_PREFIXES, from scripts/routes.mjs.
const appRoutePaths = (routes = PAGE_ROUTES.map(({ route }) => route)) =>
  Object.values(LOCALE_PREFIXES).flatMap((prefix) => [
    prefix || "/",
    ...routes.filter((route) => route !== "/").map((route) => `${prefix}${route}`),
  ]);

// A redirect is only fine when its destination is a built file or a rewrite to a built file.
const redirectIssues = (firebase, files, route, location) => {
  const destination = resolveHosting(firebase, files, location);
  if (destination.kind === "rewrite" && !files.has(destination.file)) {
    return [`${location}: rewrite target ${destination.file} is not built`];
  }
  if (
    destination.kind !== "file" &&
    !(destination.kind === "rewrite" && files.has(destination.file))
  ) {
    return [`${route}: redirect to ${location} does not resolve`];
  }
  return [];
};

const unresolvedAppRoutes = (
  dist,
  {
    routes = PAGE_ROUTES.map(({ route }) => route),
    firebase = JSON.parse(fs.readFileSync(FIREBASE_CONFIG_PATH, "utf8")),
  } = {}
) => {
  const files = new Set(dist.files().map(posixEntry));
  return appRoutePaths(routes)
    .filter((route) => !route.includes("*"))
    .flatMap((route) => {
      if (route.includes("/:")) {
        const prefix = route.slice(1, route.indexOf("/:"));
        const depth = prefix.split("/").length + 2;
        const page = [...files].find(
          (file) =>
            file.startsWith(`${prefix}/`) &&
            file.split("/").length === depth &&
            file.endsWith("/index.html")
        );
        if (!page) return [`${route}: no prerendered page under /${prefix}/`];
        // Hosting has to serve one generated URL under the prefix from its built page.
        const url = `/${page.slice(0, -"index.html".length)}`;
        const served = resolveHosting(firebase, files, url);
        if (served.kind === "redirect") return redirectIssues(firebase, files, url, served.location);
        if (served.kind !== "file" || served.file !== page) {
          return [`${url}: does not resolve to its built page ${page}`];
        }
        return [];
      }
      const resolved = resolveHosting(firebase, files, route);
      if (resolved.kind === "not-found") return [`${route}: no file, redirect or rewrite`];
      if (resolved.kind === "redirect") return redirectIssues(firebase, files, route, resolved.location);
      if (resolved.kind === "rewrite" && !files.has(resolved.file)) {
        return [`${route}: rewrite target ${resolved.file} is not built`];
      }
      const slashedRoute = route === "/" ? "/" : `${route}/`;
      const slashed = resolveHosting(firebase, files, slashedRoute);
      if (slashed.kind === "not-found") return [`${slashedRoute}: no file, redirect or rewrite`];
      if (slashed.kind === "rewrite" && !files.has(slashed.file)) {
        return [`${slashedRoute}: rewrite target ${slashed.file} is not built`];
      }
      if (slashed.kind === "redirect") return redirectIssues(firebase, files, slashedRoute, slashed.location);
      return [];
    });
};

module.exports = {
  appRoutePaths,
  unresolvedAppRoutes,
};
