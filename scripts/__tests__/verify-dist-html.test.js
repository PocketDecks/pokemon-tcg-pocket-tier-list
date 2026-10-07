const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  findEmptyStyledTags,
  findLoopbackRefs,
  findNonEmptyDeckRoots,
} = require("../verify-dist-html");

const makeDist = (files) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dist-"));
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), content);
  }
  return dir;
};

test("flags every loopback spelling in nested pages", () => {
  const dir = makeDist({
    "index.html": '<link rel="modulepreload" href="http://127.0.0.1:4173/assets/a.js" />',
    "deck/x/index.html": "<p>see http://localhost:4173/about</p>",
  });
  const refs = findLoopbackRefs(dir);
  assert.strictEqual(refs.length, 2);
  assert.ok(refs.some((r) => r.startsWith("index.html: http://127.0.0.1")));
  assert.ok(refs.some((r) => r.startsWith(`deck${path.sep}x${path.sep}index.html: http://localhost`)));
});

test("passes clean output untouched", () => {
  const dir = makeDist({
    "index.html":
      '<script type="module" src="/assets/index-CISid-uN.js"></script>' +
      '<link rel="canonical" href="https://pocketdecks.top/" />',
  });
  assert.deepStrictEqual(findLoopbackRefs(dir), []);
});

test("passes deck pages with empty roots", () => {
  const dir = makeDist({
    "deck/index.html": '<div id="root"><main>Finder</main></div>',
    "deck/x/index.html": '<div id="root"></div>',
  });
  assert.deepStrictEqual(findNonEmptyDeckRoots(dir), []);
});

test("flags deck pages with non-empty roots", () => {
  const dir = makeDist({
    "deck/x/index.html": '<div id="root"><main>Home page</main></div>',
  });
  assert.deepStrictEqual(findNonEmptyDeckRoots(dir), [
    path.join("deck", "x", "index.html"),
  ]);
});

test("passes HTML with non-empty styled-components CSS", () => {
  const dir = makeDist({
    "index.html": '<style data-styled="active">.title{color:red}</style>',
  });
  assert.deepStrictEqual(findEmptyStyledTags(dir), []);
});

test("flags empty styled-components CSS in nested pages", () => {
  const dir = makeDist({
    "index.html": '<style data-styled="active"></style>',
    "deck/x/index.html": '<style data-styled="active">\n  </style>',
  });
  const offenders = findEmptyStyledTags(dir);
  assert.strictEqual(offenders.length, 2);
  assert.ok(offenders.includes("index.html"));
  assert.ok(offenders.includes(`deck${path.sep}x${path.sep}index.html`));
});
