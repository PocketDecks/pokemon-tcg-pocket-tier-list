const test = require("node:test");
const assert = require("node:assert");
const { stampHead } = require("../meta-stamp");

const TEMPLATE = `<!doctype html><html><head>
<title>Old</title>
<link rel="canonical" href="https://pocketdecks.top">
<meta name="description" content="old desc">
</head><body><div id="root"></div></body></html>`;

test("replaces title, description and hardcoded canonical", () => {
  const out = stampHead(TEMPLATE, {
    title: "New Title",
    description: "New description",
    canonical: "https://pocketdecks.top/tier-list/",
  });
  assert.ok(out.includes("<title>New Title</title>"));
  assert.ok(out.includes('content="New description"'));
  assert.ok(!out.includes('href="https://pocketdecks.top">'));
  assert.ok(out.includes('rel="canonical" href="https://pocketdecks.top/tier-list/"'));
});

test("injects JSON-LD as single script block", () => {
  const out = stampHead(TEMPLATE.replace(/<link[^>]*canonical[^>]*>/, ""), {
    canonical: "https://pocketdecks.top/",
    jsonLd: { "@type": "WebSite", name: "Top Pocket Decks" },
  });
  assert.strictEqual(out.split('type="application/ld+json"').length - 1, 1);
  assert.ok(out.includes('"@type":"WebSite"'));
});

test("metas replace stale og/twitter tags and inject fresh ones", () => {
  const withStale = TEMPLATE.replace(
    "</head>",
    '<meta property="og:title" content="stale">\n  </head>'
  );
  const out = stampHead(withStale, {
    canonical: "https://pocketdecks.top/",
    metas: [
      '<meta property="og:title" content="Fresh">',
      '<meta property="og:url" content="https://pocketdecks.top/">',
    ],
  });
  assert.ok(!out.includes("stale"));
  assert.ok(out.includes('content="Fresh"'));
});

test("metas replace og:type once and preserve og:site_name", () => {
  const withOg = TEMPLATE.replace(
    "</head>",
    '<meta property="og:type" content="article"><meta property="og:site_name" content="Top Pocket Decks"></head>'
  );
  const out = stampHead(withOg, {
    metas: ['<meta property="og:type" content="website">'],
  });
  assert.equal((out.match(/property="og:type"/g) ?? []).length, 1);
  assert.ok(out.includes('<meta property="og:type" content="website">'));
  assert.equal((out.match(/property="og:site_name"/g) ?? []).length, 1);
  assert.ok(out.includes('<meta property="og:site_name" content="Top Pocket Decks">'));
});

test("preserves OG tags when stamping a page without metas", () => {
  const withOg = TEMPLATE.replace(
    "</head>",
    '<meta property="og:type" content="website"><meta property="og:site_name" content="Top Pocket Decks"></head>'
  );
  const out = stampHead(withOg, { robots: "noindex" });
  assert.ok(out.includes('<meta property="og:type" content="website">'));
  assert.ok(out.includes('<meta property="og:site_name" content="Top Pocket Decks">'));
});

test("JSON-LD values cannot close the script tag early", () => {
  const out = stampHead(TEMPLATE.replace(/<link[^>]*canonical[^>]*>/, ""), {
    canonical: "https://pocketdecks.top/",
    jsonLd: { "@type": "Thing", name: 'evil</script><script>alert(1)</script>' },
  });
  // The escape sequences are valid JSON string escapes, so the payload still
  // parses to the original value after decode.
  assert.ok(!out.includes("</script><script>alert"));
  assert.ok(out.includes("\\u003c/script\\u003e\\u003cscript\\u003e"));
});

test("robots replaces the template robots tag with the given directive", () => {
  const withRobots = TEMPLATE.replace("</head>", '<meta name="robots" content="index, follow">\n  </head>');
  const out = stampHead(withRobots, { robots: "noindex" });
  assert.strictEqual(out.split('name="robots"').length - 1, 1);
  assert.ok(out.includes('<meta name="robots" content="noindex">'));
  assert.ok(!out.includes("index, follow"));
});

test("throws when head closing tag missing", () => {
  assert.throws(() => stampHead("<html><body></body></html>", { canonical: "x" }));
});

const fs = require("node:fs");
const path = require("node:path");

test("HTML template ships no canonical tag", () => {
  const tpl = fs.readFileSync(
    path.join(__dirname, "..", "..", "index.html"), "utf8"
  );
  assert.ok(!tpl.includes('rel="canonical"'));
});

const { renderDeckHtml } = require("../prerender-decks");

test("deck pages get self-canonical and breadcrumb JSON-LD", () => {
  const out = renderDeckHtml(
    {
      slug: "hoopa-ex-b4-103",
      title: "Hoopa ex | Pokémon TCG Pocket Deck Stats and Matchups",
      ogImage: "https://pocketdecks.top/og/deck/hoopa-ex-b4-103.png",
      description: "Pokémon TCG Pocket deck profile for Hoopa ex.",
    },
    TEMPLATE
  );
  assert.ok(out.includes('rel="canonical" href="https://pocketdecks.top/deck/hoopa-ex-b4-103/"'));
  assert.ok(out.includes('"BreadcrumbList"'));
  assert.ok(out.includes("Hoopa ex"));
});

const { buildSitemap } = require("../generate-sitemap");

test("stamps a complete hreflang set including self and x-default", () => {
  const out = stampHead(TEMPLATE.replace(/<link[^>]*canonical[^>]*>/, ""), {
    canonical: "https://pocketdecks.top/tier-list/",
    alternates: [
      { hreflang: "en", href: "https://pocketdecks.top/tier-list/" },
      { hreflang: "ja", href: "https://pocketdecks.top/ja/tier-list/" },
      { hreflang: "x-default", href: "https://pocketdecks.top/tier-list/" },
    ],
  });
  assert.strictEqual(out.split('rel="alternate"').length - 1, 3);
  assert.ok(out.includes('hreflang="en" href="https://pocketdecks.top/tier-list/"'));
  assert.ok(out.includes('hreflang="ja" href="https://pocketdecks.top/ja/tier-list/"'));
  assert.ok(out.includes('hreflang="x-default" href="https://pocketdecks.top/tier-list/"'));
});

test("stamping alternates twice does not duplicate the set", () => {
  const alternates = [
    { hreflang: "en", href: "https://pocketdecks.top/tier-list/" },
    { hreflang: "ja", href: "https://pocketdecks.top/ja/tier-list/" },
  ];
  const withFeed =
    TEMPLATE.replace(/<link[^>]*canonical[^>]*>/, "").replace(
      "</head>",
      [
        '<link rel="alternate" type="application/rss+xml" href="/feed.xml">',
        '<link rel="manifest" href="/manifest.json">',
        "</head>",
      ].join("\n")
    );
  const once = stampHead(withFeed, {
    canonical: "https://pocketdecks.top/tier-list/",
    alternates,
  });
  const twice = stampHead(once, {
    canonical: "https://pocketdecks.top/tier-list/",
    alternates,
  });
  assert.strictEqual(twice.split('rel="alternate"').length - 1, 3);
  assert.ok(twice.includes('type="application/rss+xml" href="/feed.xml"'));
  assert.ok(twice.includes('rel="manifest" href="/manifest.json"'));
});

test("alternate hrefs are XML-escaped", () => {
  const out = stampHead(TEMPLATE.replace(/<link[^>]*canonical[^>]*>/, ""), {
    canonical: "https://pocketdecks.top/deck/a&b/",
    alternates: [
      { hreflang: "en", href: "https://pocketdecks.top/deck/a&b/" },
      { hreflang: "ja", href: "https://pocketdecks.top/ja/deck/a&b/" },
    ],
  });
  assert.ok(out.includes("https://pocketdecks.top/deck/a&amp;b/"));
  assert.ok(!/href="[^"]*[^m]&[^a]/.test(out));
});

test("sets the document language on the html tag", () => {
  const out = stampHead('<html><head></head></html>', { lang: "ja" });
  assert.ok(out.includes('<html lang="ja">'));
});

test("replaces an existing document language rather than adding a second", () => {
  const out = stampHead('<html lang="en"><head></head></html>', { lang: "ja" });
  assert.strictEqual(out.split("lang=").length - 1, 1);
  assert.ok(out.includes('<html lang="ja">'));
});

test("keeps other html attributes while setting the language", () => {
  const out = stampHead('<html data-theme="dark"><head></head></html>', { lang: "en" });
  assert.ok(out.includes('data-theme="dark"'));
  assert.ok(out.includes('lang="en"'));
});

test("sitemap URLs carry trailing slashes and match canonical form", () => {
  const xml = buildSitemap({ decks: [{ name: "hoopa-ex-b4-103" }], lastmod: "2026-08-24" });
  assert.ok(xml.includes("<loc>https://pocketdecks.top/tier-list/</loc>"));
  assert.ok(xml.includes("<loc>https://pocketdecks.top/deck/hoopa-ex-b4-103/</loc>"));
  assert.ok(!xml.includes("<loc>https://pocketdecks.top/tier-list<"));
});

test("stamping a title leaves exactly one title in the head", () => {
  const doubled = `<!doctype html><html><head><title>Hoisted</title><title>Template default</title></head><body></body></html>`;
  const out = stampHead(doubled, { title: "Mega Greninja ex Deck | Pokemon TCG Pocket" });
  assert.deepStrictEqual(out.match(/<title\b[^>]*>[\s\S]*?<\/title>/gi), [
    "<title>Mega Greninja ex Deck | Pokemon TCG Pocket</title>",
  ]);
});

test("stamping a title leaves svg titles in the body alone", () => {
  const withSvg = `<!doctype html><html><head><title>Old</title></head><body><svg><title>icon</title></svg></body></html>`;
  const out = stampHead(withSvg, { title: "Rampardos デッキ" });
  assert.ok(out.includes("<svg><title>icon</title></svg>"));
  assert.deepStrictEqual(out.match(/<head\b[^>]*>[\s\S]*?<\/head>/i)[0].match(/<title\b/gi).length, 1);
});
