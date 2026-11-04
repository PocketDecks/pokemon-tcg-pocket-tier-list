const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { findHubPageIssues } = require("../verify-dist-html");

const EN = "https://pocketdecks.top/deck/alpha/";
const JA = "https://pocketdecks.top/ja/deck/alpha/";

const page = ({
  canonicals = [EN],
  title = "Alpha Deck | Pokemon TCG Pocket",
  robots = "index, follow",
  description = "A deck profile",
  h1 = "Alpha Deck",
  breadcrumb = "Alpha Deck",
}) =>
  `<!doctype html><html><head><title>${title}</title>` +
  `<meta name="description" content="${description}">` +
  `<meta name="robots" content="${robots}">` +
  canonicals.map((href) => `<link rel="canonical" href="${href}">`).join("") +
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
  { variant: "alpha-b1-102", hub: "alpha", name: "Alpha-B1-102", firstSeen: "2025-10-01", lastSeen: "2026-10-01" },
];

test("well-formed hub pages in both locales have no issues", () => {
  const dir = makeDist({
    "deck/alpha/index.html": page({ canonicals: [EN] }),
    "ja/deck/alpha/index.html": page({ canonicals: [JA], robots: "noindex, follow" }),
  });
  assert.deepStrictEqual(findHubPageIssues(dir, archive), []);
});

test("a hub page with undefined text, a wrong robots value or no H1 is reported", () => {
  const dir = makeDist({
    "deck/alpha/index.html": page({
      title: "undefined Deck | Pokemon TCG Pocket",
      robots: "noindex, follow",
      h1: "",
    }),
    "ja/deck/alpha/index.html": page({
      canonicals: [JA],
      robots: "index, follow",
      breadcrumb: "undefined",
    }),
  });
  const issues = findHubPageIssues(dir, archive);
  assert.ok(issues.some((issue) => issue.startsWith("deck/alpha/index.html") && /robots/.test(issue)), issues.join("\n"));
  assert.ok(issues.some((issue) => issue.startsWith("deck/alpha/index.html") && /undefined/.test(issue)), issues.join("\n"));
  assert.ok(issues.some((issue) => issue.startsWith("deck/alpha/index.html") && /H1/.test(issue)), issues.join("\n"));
  assert.ok(issues.some((issue) => issue.startsWith("ja/deck/alpha/index.html") && /robots/.test(issue)), issues.join("\n"));
  assert.ok(issues.some((issue) => issue.startsWith("ja/deck/alpha/index.html") && /undefined/.test(issue)), issues.join("\n"));
});

test("a missing hub page is reported", () => {
  const dir = makeDist({});
  const issues = findHubPageIssues(dir, archive);
  assert.ok(issues.includes("deck/alpha/index.html: missing"));
});

test("a hub page whose H1 does not name the hub is reported", () => {
  const dir = makeDist({
    "deck/alpha/index.html": page({ h1: "Page not found" }),
    "ja/deck/alpha/index.html": page({ canonicals: [JA], robots: "noindex, follow" }),
  });
  const issues = findHubPageIssues(dir, archive);
  assert.ok(
    issues.some((issue) => issue.startsWith("deck/alpha/index.html") && /H1/.test(issue) && /Alpha/.test(issue)),
    issues.join("\n")
  );
  assert.ok(!issues.some((issue) => issue.startsWith("ja/deck/alpha/index.html")), issues.join("\n"));
});

test("a hub page with more than one canonical is reported", () => {
  const dir = makeDist({
    "deck/alpha/index.html": page({ canonicals: [EN, EN] }),
    "ja/deck/alpha/index.html": page({ canonicals: [JA], robots: "noindex, follow" }),
  });
  const issues = findHubPageIssues(dir, archive);
  assert.deepStrictEqual(issues, ["deck/alpha/index.html: expected 1 canonical, found 2"]);
});

test("a hub page with no canonical is reported", () => {
  const dir = makeDist({
    "deck/alpha/index.html": page({ canonicals: [] }),
    "ja/deck/alpha/index.html": page({ canonicals: [JA], robots: "noindex, follow" }),
  });
  const issues = findHubPageIssues(dir, archive);
  assert.deepStrictEqual(issues, ["deck/alpha/index.html: expected 1 canonical, found 0"]);
});

test("a hub page with an empty title is reported", () => {
  const dir = makeDist({
    "deck/alpha/index.html": page({ title: "" }),
    "ja/deck/alpha/index.html": page({ canonicals: [JA], robots: "noindex, follow" }),
  });
  const issues = findHubPageIssues(dir, archive);
  assert.deepStrictEqual(issues, ["deck/alpha/index.html: empty title"]);
});

test("a hub page with an empty description is reported", () => {
  const dir = makeDist({
    "deck/alpha/index.html": page({ description: "" }),
    "ja/deck/alpha/index.html": page({ canonicals: [JA], robots: "noindex, follow" }),
  });
  const issues = findHubPageIssues(dir, archive);
  assert.deepStrictEqual(issues, ["deck/alpha/index.html: empty description"]);
});

test("a retired English hub page is indexable too", () => {
  const retired = [
    { variant: "alpha-b1-102", hub: "retired", name: "Alpha-B1-102", firstSeen: "2024-01-01", lastSeen: "2024-06-01" },
  ];
  const indexed = makeDist({
    "deck/retired/index.html": page({ canonicals: ["https://pocketdecks.top/deck/retired/"], robots: "index, follow" }),
    "ja/deck/retired/index.html": page({
      canonicals: ["https://pocketdecks.top/ja/deck/retired/"],
      robots: "noindex, follow",
    }),
  });
  assert.deepStrictEqual(findHubPageIssues(indexed, retired), []);
  const noindex = makeDist({
    "deck/retired/index.html": page({ canonicals: ["https://pocketdecks.top/deck/retired/"], robots: "noindex, follow" }),
    "ja/deck/retired/index.html": page({
      canonicals: ["https://pocketdecks.top/ja/deck/retired/"],
      robots: "noindex, follow",
    }),
  });
  assert.deepStrictEqual(findHubPageIssues(noindex, retired), [
    "deck/retired/index.html: robots noindex, follow is not index, follow",
  ]);
});
