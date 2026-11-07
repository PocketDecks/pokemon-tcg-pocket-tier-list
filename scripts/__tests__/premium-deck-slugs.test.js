const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  loadPremiumDeckSlugs,
  premiumDeckSlugIssues,
  PREMIUM_DECK_SLUGS_FILE,
} = require("../premium-deck-slugs.mjs");
const { buildSitemap } = require("../generate-sitemap");
const { resolveHosting } = require("../firebase-hosting");
const { redirectRules, liveDeckSlugs } = require("../generate-deck-redirects.mjs");
const { deckSlug } = require("../deck-slug.mjs");

const ROOT = path.join(__dirname, "..", "..");
const DATA_DIR = path.join(ROOT, "public", "data");
const PREMIUM_ONLY = "mega-altaria-ex-b1-102&bonsly-b3-078";
const SHELL_ONLY = "premium-only-a1-999&other-a1-998";

const writeTemp = (text) => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "slugs-")), "premium-deck-slugs.json");
  fs.writeFileSync(file, text);
  return file;
};

test("the committed slug list sits in src/data", () => {
  assert.equal(path.relative(ROOT, PREMIUM_DECK_SLUGS_FILE).split(path.sep).join("/"), "src/data/premium-deck-slugs.json");
});

test("the committed slug list is empty while every window is identical", () => {
  assert.deepEqual(loadPremiumDeckSlugs(), {});
});

test("the committed slug list passes its own checks against the live decks", () => {
  const live = new Set(
    JSON.parse(fs.readFileSync(path.join(DATA_DIR, "best-decks.json"), "utf8")).map((deck) => deckSlug(deck.name))
  );
  assert.deepEqual(premiumDeckSlugIssues(loadPremiumDeckSlugs(), live), []);
});

test("loads a list from an explicit file", () => {
  const file = writeTemp(`{"${PREMIUM_ONLY}":["30d","all"]}\n`);
  assert.deepEqual(loadPremiumDeckSlugs(file), { [PREMIUM_ONLY]: ["30d", "all"] });
});

test("accepts a sorted list of premium-only slugs offered in premium windows", () => {
  assert.deepEqual(
    premiumDeckSlugIssues({ "a-a1-001": ["all"], [PREMIUM_ONLY]: ["30d", "all"] }, new Set(["live-a1-002"])),
    []
  );
});

test("flags a slug the default window already offers", () => {
  assert.deepEqual(premiumDeckSlugIssues({ "live-a1-002": ["30d"] }, new Set(["live-a1-002"])), [
    "live-a1-002: also offered in the default window",
  ]);
});

test("flags keys out of order", () => {
  assert.deepEqual(premiumDeckSlugIssues({ "b-a1-001": ["all"], "a-a1-001": ["all"] }, new Set()), [
    "slugs are not sorted",
  ]);
});

test("flags windows that are empty, repeated or not premium windows", () => {
  assert.deepEqual(
    premiumDeckSlugIssues(
      { "a-a1-001": [], "b-a1-001": ["30d", "30d"], "c-a1-001": ["20d"], "d-a1-001": "all" },
      new Set()
    ),
    [
      "a-a1-001: expected a list of premium windows",
      "b-a1-001: expected a list of premium windows",
      "c-a1-001: expected a list of premium windows",
      "d-a1-001: expected a list of premium windows",
    ]
  );
});

test("flags slugs that are not safe path segments", () => {
  for (const slug of ["../escape", "has space", "UPPER-a1-001", "a/b", ""]) {
    assert.deepEqual(premiumDeckSlugIssues({ [slug]: ["all"] }, new Set()), [`${slug}: not a safe slug`], slug);
  }
});

test("flags a list that is not an object", () => {
  assert.deepEqual(premiumDeckSlugIssues([], new Set()), ["expected an object keyed by slug"]);
  assert.deepEqual(premiumDeckSlugIssues(null, new Set()), ["expected an object keyed by slug"]);
});

test("the sitemap never names a slug that only the premium windows offer", () => {
  const xml = buildSitemap({
    decks: [{ name: "garchomp-a2-123" }],
    archive: [
      { variant: PREMIUM_ONLY, hub: "mega-altaria-ex", name: PREMIUM_ONLY, firstSeen: "2026-01-01", lastSeen: "2026-01-02" },
    ],
    lastmod: "2026-11-07",
  });
  assert.ok(!xml.includes(PREMIUM_ONLY));
  assert.ok(!xml.includes("premium"));
});

test("the generated redirects treat a premium-only slug as live", () => {
  const archive = [
    { variant: PREMIUM_ONLY, hub: "mega-altaria-ex", name: PREMIUM_ONLY, firstSeen: "2026-01-01", lastSeen: "2026-01-02", legacySlugs: ["old-style"] },
  ];
  const live = liveDeckSlugs([{ name: "garchomp-a2-123" }], { [PREMIUM_ONLY]: ["30d"] });

  assert.deepEqual([...live].sort(), ["garchomp-a2-123", PREMIUM_ONLY].sort());
  const rules = redirectRules(archive, live);
  assert.ok(!rules.some((rule) => rule.source.startsWith(`/deck/${PREMIUM_ONLY}{`)));
  assert.deepEqual(
    rules.filter((rule) => rule.source.startsWith("/deck/old-style")).map((rule) => rule.destination),
    [`/deck/${PREMIUM_ONLY}/`]
  );
});

test("without the premium list the same variant would be redirected away", () => {
  const archive = [
    { variant: PREMIUM_ONLY, hub: "mega-altaria-ex", name: PREMIUM_ONLY, firstSeen: "2026-01-01", lastSeen: "2026-01-02" },
  ];
  const rules = redirectRules(archive, liveDeckSlugs([{ name: "garchomp-a2-123" }], {}));
  assert.ok(rules.some((rule) => rule.source.startsWith(`/deck/${PREMIUM_ONLY}{`)));
});

test("hosting serves a built shell and still answers an unknown slug with the real 404", () => {
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, "firebase.json"), "utf8"));
  const files = new Set([
    "index.html",
    "404.html",
    "app-shell.html",
    `deck/${SHELL_ONLY}/index.html`,
    `ja/deck/${SHELL_ONLY}/index.html`,
  ]);
  const resolve = (request) => resolveHosting(config, files, request);

  assert.deepEqual(resolve(`/deck/${SHELL_ONLY}/`), {
    kind: "file",
    file: `deck/${SHELL_ONLY}/index.html`,
    status: 200,
  });
  assert.deepEqual(resolve(`/ja/deck/${SHELL_ONLY}/`).status, 200);
  assert.deepEqual(resolve("/deck/not-a-deck-a1-001/"), { kind: "not-found", status: 404, file: "404.html" });
});

test("hosting has no catch-all rewrite onto the app shell for deck paths", () => {
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, "firebase.json"), "utf8"));
  const catchAll = (config.hosting.rewrites ?? []).filter(
    (rule) => rule.source === "**" || rule.source === "/**" || rule.source.startsWith("/deck") || rule.source.startsWith("/ja/deck")
  );
  assert.deepEqual(catchAll, []);
});

test("check:generated validates the slug list without loading .env", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const step = pkg.scripts["check:generated"]
    .split("&&")
    .map((part) => part.trim())
    .find((part) => part.includes("premium-deck-slugs.mjs"));

  assert.equal(step, "node scripts/premium-deck-slugs.mjs --check");
});

test("the slug list check passes on the committed list", () => {
  const { execFileSync } = require("node:child_process");
  const output = execFileSync(process.execPath, [path.join(ROOT, "scripts", "premium-deck-slugs.mjs"), "--check"], {
    encoding: "utf8",
  });

  assert.match(output, /premium-deck-slugs: current/);
});
