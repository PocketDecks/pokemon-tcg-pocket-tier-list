const test = require("node:test");
const assert = require("node:assert");

const {
  LOCALE_PREFIXES,
  ROUTE_LOCALES,
  localeRoute,
  prefixedLocale,
  splitLocale,
} = require("../locale-route.mjs");

test("the shipped locale set is en and ja", () => {
  assert.deepStrictEqual(ROUTE_LOCALES, ["en", "ja"]);
  assert.strictEqual(LOCALE_PREFIXES.en, "");
  assert.strictEqual(LOCALE_PREFIXES.ja, "/ja");
});

test("localeRoute leaves English routes unprefixed and prefixes Japanese ones", () => {
  assert.strictEqual(localeRoute("en", "/tier-list"), "/tier-list");
  assert.strictEqual(localeRoute("ja", "/tier-list"), "/ja/tier-list");
  assert.strictEqual(localeRoute("en", "/"), "/");
  assert.strictEqual(localeRoute("ja", "/"), "/ja/");
});

test("localeRoute handles a nested deck route", () => {
  assert.strictEqual(localeRoute("en", "/deck/x-a1-001"), "/deck/x-a1-001");
  assert.strictEqual(localeRoute("ja", "/deck/x-a1-001"), "/ja/deck/x-a1-001");
});

test("splitLocale strips a locale prefix and defaults to en", () => {
  assert.deepStrictEqual(splitLocale("/ja/deck/x"), { locale: "ja", rest: "/deck/x" });
  assert.deepStrictEqual(splitLocale("/deck/x"), { locale: "en", rest: "/deck/x" });
  assert.deepStrictEqual(splitLocale("/ja/"), { locale: "ja", rest: "/" });
  assert.deepStrictEqual(splitLocale("/ja"), { locale: "ja", rest: "/" });
  assert.deepStrictEqual(splitLocale("/"), { locale: "en", rest: "/" });
});

test("prefixedLocale reports only a genuine locale prefix", () => {
  assert.strictEqual(prefixedLocale("/ja/deck/x"), "ja");
  assert.strictEqual(prefixedLocale("/ja/"), "ja");
  assert.strictEqual(prefixedLocale("/deck/x"), null);
  assert.strictEqual(prefixedLocale("/tier-list"), null);
  assert.strictEqual(prefixedLocale("/"), null);
});

test("prefixedLocale does not mistake a route for a locale", () => {
  assert.strictEqual(prefixedLocale("/japanese-cards"), null);
  assert.strictEqual(prefixedLocale("/decks"), null);
});

test("splitLocale inverts localeRoute for every locale and route", () => {
  for (const locale of ROUTE_LOCALES) {
    for (const route of ["/", "/tier-list", "/deck/x-a1-001", "/about"]) {
      assert.strictEqual(splitLocale(localeRoute(locale, route)).locale, locale);
      assert.strictEqual(splitLocale(localeRoute(locale, route)).rest, route);
    }
  }
});
