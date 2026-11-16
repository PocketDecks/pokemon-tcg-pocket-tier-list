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
        const hasPage = [...files].some(
          (file) =>
            file.startsWith(`${prefix}/`) &&
            file.split("/").length === depth &&
            file.endsWith("/index.html")
        );
        return hasPage ? [] : [`${route}: no prerendered page under /${prefix}/`];
      }
      const resolved = resolveHosting(firebase, files, route);
      if (resolved.kind === "not-found") return [`${route}: no file, redirect or rewrite`];
      if (resolved.kind === "redirect") {
        const destination = resolveHosting(firebase, files, resolved.location);
        if (destination.kind === "rewrite" && !files.has(destination.file)) {
          return [`${resolved.location}: rewrite target ${destination.file} is not built`];
        }
        if (
          destination.kind !== "file" &&
          !(destination.kind === "rewrite" && files.has(destination.file))
        ) {
          return [`${route}: redirect to ${resolved.location} does not resolve`];
        }
      }
      if (resolved.kind === "rewrite" && !files.has(resolved.file)) {
        return [`${route}: rewrite target ${resolved.file} is not built`];
      }
      if (resolved.kind === "redirect") return [];
      const slashedRoute = route === "/" ? "/" : `${route}/`;
      const slashed = resolveHosting(firebase, files, slashedRoute);
      if (slashed.kind === "not-found") return [`${slashedRoute}: no file, redirect or rewrite`];
      if (slashed.kind === "rewrite" && !files.has(slashed.file)) {
        return [`${slashedRoute}: rewrite target ${slashed.file} is not built`];
      }
      return [];
    });
};

module.exports = {
  appRoutePaths,
  unresolvedAppRoutes,
};
