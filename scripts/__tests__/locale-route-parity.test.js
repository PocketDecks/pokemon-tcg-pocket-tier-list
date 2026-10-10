const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const APP_SOURCE = path.join(__dirname, "..", "..", "src", "App.tsx");
const { LOCALE_PREFIXES } = require("../locale-route.mjs");

const readAppRoutePaths = (source) => {
  const tokens = [...source.matchAll(/<Route\b|<\/Route>/g)];
  const stack = [];
  const routes = [];
  tokens.forEach((token, index) => {
    if (token[0] === "</Route>") {
      stack.pop();
      return;
    }
    const end = index + 1 < tokens.length ? tokens[index + 1].index : source.length;
    const segment = source.slice(token.index, end);
    const parent = stack[stack.length - 1] ?? "";
    const own = segment.match(/\spath="([^"]*)"/)?.[1];
    const full =
      own === undefined
        ? parent || "/"
        : own.startsWith("/")
          ? own
          : `${parent.replace(/\/$/, "")}/${own}`;
    if (own !== undefined) routes.push(full);
    if (!/\/>\s*$/.test(segment.trimEnd())) stack.push(full);
  });
  return routes;
};

// The locale tables are written out literally because verify-dist-html reads the
// route paths out of this file; a shared fragment hides them from that check.
test("every prefixed locale renders the same routes as the default locale", () => {
  const routes = readAppRoutePaths(fs.readFileSync(APP_SOURCE, "utf8"));
  const prefixed = Object.values(LOCALE_PREFIXES).filter((prefix) => prefix !== "");

  const defaultRoutes = routes
    .filter(
      (route) =>
        route !== "/" &&
        !prefixed.some((prefix) => route === prefix || route.startsWith(`${prefix}/`))
    )
    .sort();

  for (const prefix of prefixed) {
    const localeRoutes = routes
      .filter((route) => route === prefix || route.startsWith(`${prefix}/`))
      .map((route) => (route === prefix ? "/" : route.slice(prefix.length)))
      .filter((route) => route !== "/")
      .sort();
    assert.deepStrictEqual(
      localeRoutes,
      defaultRoutes,
      `${prefix} does not render the same routes as the default locale`
    );
  }
});
