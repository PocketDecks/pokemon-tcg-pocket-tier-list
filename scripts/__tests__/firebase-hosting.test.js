const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { resolveHosting } = require("../firebase-hosting");
const { deckSlug } = require("../deck-slug.mjs");
const { redirectRules } = require("../generate-deck-redirects.mjs");

const config = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "..", "firebase.json"), "utf8")
);
const FILES = new Set([
  "index.html",
  "404.html",
  "app-shell.html",
  "tier-list/index.html",
  "statistics/index.html",
  "deck/index.html",
  "deck/hoopa-ex/index.html",
  "deck/mega-charizard-y-ex-b1a-014&charizard-c1-018/index.html",
  "assets/index-abc.js",
]);
const resolve = (requestPath) => resolveHosting(config, FILES, requestPath);
const NOT_FOUND = { kind: "not-found", status: 404, file: "404.html" };

const DATA_DIR = path.join(__dirname, "..", "..", "public", "data");
const archive = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "deck-archive.json"), "utf8"));
const liveSlugs = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "best-decks.json"), "utf8")).map((deck) =>
  deckSlug(deck.name)
);
const hubs = [...new Set(archive.map((entry) => entry.hub))];
const DECK_FILES = new Set(["index.html", "404.html", "app-shell.html"]);
for (const prefix of ["", "ja/"]) {
  for (const hub of hubs) DECK_FILES.add(`${prefix}deck/${hub}/index.html`);
  for (const slug of liveSlugs) DECK_FILES.add(`${prefix}deck/${slug}/index.html`);
}
const resolveDeck = (requestPath) => resolveHosting(config, DECK_FILES, requestPath);

const SEARCH_CONSOLE_404S = [
  "/deck/great-tusk-b3a-034/",
  "/deck/chandelure-b2-069/",
  "/deck/gyarados-a4-045&suicune-ex-a4a-020",
  "/deck/zoroark-ex-b3-106/",
  "/deck/alolan-ninetales-ex-b2-029",
  "/deck/mega-venusaur-ex-b1a-004",
  "/deck/jolteon-ex-b1-081&magnezone-a2-053",
  "/deck/meowscarada-ex-b2a-003",
  "/deck/mega-steelix-ex-b1a-052",
  "/deck/mega-mawile-ex-b2-113",
  "/deck/silvally-a3a-061&oricorio-a3-066",
  "/deck/vespiquen-ex-b4-011",
  "/deck/dragonite-ex-a3b-053",
  "/deck/miraidon-ex-b3a-019",
  "/deck/bellibolt-ex-b2a-042",
  "/deck/guzzlord-ex-a3a-043",
  "/deck/mega-charizard-x-ex-b2b-009",
  "/deck/exeggutor-ex-a1-023",
  "/deck/chandelure-b2-069",
  "/deck/jolteon-ex-b1-081",
  "/deck/rampardos-a2-089",
  "/deck/naganadel-a3a-045",
  "/deck/baxcalibur-b2a-036",
  "/deck/mega-kangaskhan-ex-b2-127",
  "/deck/indeedee-ex-b1-121&oricorio-a3-066",
  "/deck/great-tusk-b3a-034",
  "/deck/zoroark-ex-b3-106",
  "/deck/professor's-research-pa-007",
  "/deck/professor's-research-pa-007/",
];

const JAPANESE_404S = [
  "/ja/deck/mega-garchomp-ex-pb-099&dragonair-b4-117",
  "/ja/deck/mega-gardevoir-ex-b2-066&gardevoir-b2-065/",
  "/ja/deck/zoroark-ex-b3-106/",
];

test("retired deck URLs and stray CRA paths get a real 404", () => {
  assert.deepStrictEqual(resolve("/deck/hydreigon-b1-157/"), {
    kind: "redirect",
    status: 301,
    location: "/deck/hydreigon/",
  });
  assert.deepStrictEqual(resolve("/deck/mewtwo-ex"), NOT_FOUND);
  assert.deepStrictEqual(resolve("/deck/espeon-b3a-020&swablu-b1-196/"), {
    kind: "redirect",
    status: 301,
    location: "/deck/espeon/",
  });
  assert.deepStrictEqual(
    resolve("/static/media/tier-list.f2be021f77be320a4822.jpeg"),
    NOT_FOUND
  );
});

test("unknown paths and missing assets never fall back to the home page", () => {
  assert.deepStrictEqual(resolve("/does-not-exist"), NOT_FOUND);
  assert.deepStrictEqual(resolve("/assets/missing.js"), NOT_FOUND);
  assert.ok(
    !config.hosting.rewrites.some((rule) => rule.destination === "/index.html"),
    "no rewrite may serve the prerendered home page"
  );
});

test("punctuated deck URLs permanently redirect to the hub", () => {
  const redirect = {
    kind: "redirect",
    status: 301,
    location: "/deck/professors-research/",
  };
  assert.deepStrictEqual(resolve("/deck/professor's-research-pa-007"), redirect);
  assert.deepStrictEqual(resolve("/deck/professor's-research-pa-007/"), redirect);
});

test("archived variant redirects match slashless and trailing-slash paths", () => {
  const redirect = {
    kind: "redirect",
    status: 301,
    location: "/deck/umbreon-ex/",
  };
  assert.deepStrictEqual(resolve("/deck/umbreon-ex-a4-112&greninja-a1-089"), redirect);
  assert.deepStrictEqual(resolve("/deck/umbreon-ex-a4-112&greninja-a1-089/"), redirect);
});

test("stats permanently redirects to statistics", () => {
  const redirect = { kind: "redirect", status: 301, location: "/statistics/" };
  assert.deepStrictEqual(resolve("/stats"), redirect);
  assert.deepStrictEqual(resolve("/stats/"), redirect);
});

test("legacy card and expansion paths permanently redirect", () => {
  assert.deepStrictEqual(resolve("/cards"), {
    kind: "redirect",
    status: 301,
    location: "/cards-list/",
  });
  assert.deepStrictEqual(resolve("/cards/"), {
    kind: "redirect",
    status: 301,
    location: "/cards-list/",
  });
  assert.deepStrictEqual(resolve("/expansions"), {
    kind: "redirect",
    status: 301,
    location: "/expansion-list/",
  });
  assert.deepStrictEqual(resolve("/expansions/"), {
    kind: "redirect",
    status: 301,
    location: "/expansion-list/",
  });
});

test("feedback is served by the app shell with status 200", () => {
  const rewrite = { kind: "rewrite", status: 200, file: "app-shell.html" };
  assert.deepStrictEqual(resolve("/feedback"), rewrite);
  assert.deepStrictEqual(resolve("/feedback/"), rewrite);
});

test("crawler policy and security policy files resolve to their own static files", () => {
  for (const file of ["robots.txt", "llms.txt", ".well-known/security.txt"]) {
    assert.ok(
      fs.existsSync(path.join(__dirname, "..", "..", "public", file)),
      `${file} is missing from public/`
    );
    assert.deepStrictEqual(resolveHosting(config, new Set([file]), `/${file}`), {
      kind: "file",
      file,
      status: 200,
    });
  }
});

test("prerendered routes resolve to their own files", () => {
  assert.deepStrictEqual(resolve("/"), { kind: "file", file: "index.html", status: 200 });
  assert.deepStrictEqual(resolve("/tier-list/"), {
    kind: "file",
    file: "tier-list/index.html",
    status: 200,
  });
  assert.deepStrictEqual(resolve("/tier-list"), {
    kind: "redirect",
    status: 301,
    location: "/tier-list/",
  });
  assert.deepStrictEqual(resolve("/deck/mega-charizard-y-ex-b1a-014&charizard-c1-018/"), {
    kind: "file",
    file: "deck/mega-charizard-y-ex-b1a-014&charizard-c1-018/index.html",
    status: 200,
  });
});

test("search console 404 deck URLs in both locales resolve to a redirect or a page", () => {
  for (const url of [...SEARCH_CONSOLE_404S, ...JAPANESE_404S]) {
    const result = resolveDeck(url);
    assert.ok(
      result.kind === "file" || result.status === 301,
      `${url} resolved to ${result.kind} ${result.status}`
    );
  }
});

test("every old-formula deck slug permanently redirects to its live variant or hub in both locales", () => {
  const legacy = archive.flatMap((entry) =>
    (entry.legacySlugs ?? []).map((slug) => ({ slug, entry }))
  );
  assert.equal(legacy.length, 25);
  for (const { slug, entry } of legacy) {
    const target = liveSlugs.includes(entry.variant) ? entry.variant : entry.hub;
    assert.deepStrictEqual(
      resolveDeck(`/deck/${slug}`),
      { kind: "redirect", status: 301, location: `/deck/${target}/` },
      slug
    );
    assert.deepStrictEqual(
      resolveDeck(`/ja/deck/${slug}/`),
      { kind: "redirect", status: 301, location: `/ja/deck/${target}/` },
      slug
    );
  }
});

test("live variants and hubs serve pages in both locales", () => {
  for (const prefix of ["", "/ja"]) {
    for (const slug of [...liveSlugs, ...hubs]) {
      const url = `${prefix}/deck/${slug}/`;
      assert.equal(resolveDeck(url).status, 200, url);
    }
  }
});

test("generated deck redirects are never self-loops and always land on a page", () => {
  for (const rule of config.hosting.redirects) {
    if (!rule.source.includes("/deck/") || !rule.source.endsWith("{,/**}")) continue;
    const base = rule.source.slice(0, -"{,/**}".length);
    assert.notEqual(rule.destination.replace(/\/$/, ""), base, rule.source);
    assert.equal(resolveDeck(rule.destination).status, 200, rule.destination);
  }
});

test("professor's research legacy URLs no longer need hand-kept rules", () => {
  assert.ok(
    !config.hosting.redirects.some((rule) => rule.source.startsWith("/deck/professor's-research-pa-007") && !rule.source.endsWith("{,/**}")),
    "hand-kept Professor's Research rules must be generated"
  );
});

test("generated deck redirects refuse sources with glob metacharacters", () => {
  assert.throws(
    () =>
      redirectRules(
        [{ variant: "odd*-a1-001", hub: "odd", name: "odd-a1-001", firstSeen: "2025-01-01", lastSeen: "2025-01-01" }],
        new Set()
      ),
    /odd\*-a1-001/
  );
});
