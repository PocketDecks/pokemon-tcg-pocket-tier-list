const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { findHubPageIssues } = require("../verify-dist-html");

const page = ({ canonical, title, robots, description = "A deck profile", h1 = "A Deck", breadcrumb = "A Deck" }) =>
  `<!doctype html><html><head><title>${title}</title>` +
  `<meta name="description" content="${description}">` +
  `<meta name="robots" content="${robots}">` +
  `<link rel="canonical" href="${canonical}">` +
  `<script type="application/ld+json">{"itemListElement":[{"name":"${breadcrumb}"}]}</script>` +
  `</head><body><h1>${h1}</h1></body></html>`;

const makeDist = (files) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hub-dist-"));
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), content);
  }
  return dir;
};

const archive = [
  { variant: "a-1", hub: "a", name: "A-1", firstSeen: "2025-10-01", lastSeen: "2026-10-01" },
];
const PREVIOUS = "2026-08-27";
const EN = "https://pocketdecks.top/deck/a/";
const JA = "https://pocketdecks.top/ja/deck/a/";

test("well-formed hub pages in both locales have no issues", () => {
  const dir = makeDist({
    "deck/a/index.html": page({ canonical: EN, title: "A Deck | Pokemon TCG Pocket", robots: "index, follow" }),
    "ja/deck/a/index.html": page({ canonical: JA, title: "A Deck | Pokemon TCG Pocket", robots: "noindex, follow" }),
  });
  assert.deepStrictEqual(findHubPageIssues(dir, archive, [], PREVIOUS), []);
});

test("a hub page with undefined text, a wrong robots value or no H1 is reported", () => {
  const dir = makeDist({
    "deck/a/index.html": page({
      canonical: EN,
      title: "undefined Deck | Pokemon TCG Pocket",
      robots: "noindex, follow",
      h1: "",
    }),
    "ja/deck/a/index.html": page({
      canonical: JA,
      title: "A Deck | Pokemon TCG Pocket",
      robots: "index, follow",
      breadcrumb: "undefined",
    }),
  });
  const issues = findHubPageIssues(dir, archive, [], PREVIOUS);
  assert.ok(issues.some((issue) => issue.startsWith("deck/a/index.html") && /robots/.test(issue)), issues.join("\n"));
  assert.ok(issues.some((issue) => issue.startsWith("deck/a/index.html") && /undefined/.test(issue)), issues.join("\n"));
  assert.ok(issues.some((issue) => issue.startsWith("deck/a/index.html") && /H1/.test(issue)), issues.join("\n"));
  assert.ok(issues.some((issue) => issue.startsWith("ja/deck/a/index.html") && /robots/.test(issue)), issues.join("\n"));
  assert.ok(issues.some((issue) => issue.startsWith("ja/deck/a/index.html") && /undefined/.test(issue)), issues.join("\n"));
});

test("a missing hub page is reported", () => {
  const dir = makeDist({});
  const issues = findHubPageIssues(dir, archive, [], PREVIOUS);
  assert.ok(issues.includes("deck/a/index.html: missing"));
});
