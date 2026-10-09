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
      ogUrl: "https://pocketdecks.top/deck/hoopa-ex-b4-103",
      description: "Pokémon TCG Pocket deck profile for Hoopa ex.",
    },
    TEMPLATE
  );
  assert.ok(out.includes('rel="canonical" href="https://pocketdecks.top/deck/hoopa-ex-b4-103/"'));
  assert.ok(out.includes('"BreadcrumbList"'));
  assert.ok(out.includes("Hoopa ex"));
});

const { buildSitemap } = require("../generate-sitemap");

test("sitemap URLs carry trailing slashes and match canonical form", () => {
  const xml = buildSitemap({ decks: [{ name: "hoopa-ex-b4-103" }], lastmod: "2026-08-24" });
  assert.ok(xml.includes("<loc>https://pocketdecks.top/tier-list/</loc>"));
  assert.ok(xml.includes("<loc>https://pocketdecks.top/deck/hoopa-ex-b4-103/</loc>"));
  assert.ok(!xml.includes("<loc>https://pocketdecks.top/tier-list<"));
});
