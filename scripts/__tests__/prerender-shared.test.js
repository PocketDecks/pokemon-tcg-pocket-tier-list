const test = require("node:test");
const assert = require("node:assert");
const { mapWithConcurrency, readTemplate } = require("../prerender-shared");

test("maps every item with no more lanes running than the concurrency", async () => {
  let active = 0;
  let peak = 0;
  const seen = [];
  await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async (item) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    seen.push(item);
    active -= 1;
  });
  assert.deepStrictEqual(seen.sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7]);
  assert.strictEqual(peak, 3);
});

test("rethrows the first failure and starts no further items", async () => {
  const started = [];
  await assert.rejects(
    mapWithConcurrency([1, 2, 3, 4, 5, 6], 2, async (item) => {
      started.push(item);
      if (item === 2) throw new Error("deck 2 broke");
      await new Promise((resolve) => setTimeout(resolve, 10));
    }),
    /deck 2 broke/
  );
  assert.deepStrictEqual(started, [1, 2]);
});

test("reads the theme colour, modulepreloads and scripts from the template", () => {
  const template = readTemplate(
    '<head><meta name="theme-color" content="#abcdef">' +
      '<link rel="modulepreload" href="/assets/a.js">' +
      '<link rel="stylesheet" href="/app.css"></head>' +
      '<body><script type="module" src="/assets/index.js"></script></body>'
  );
  assert.strictEqual(template.themeColor, "#abcdef");
  assert.deepStrictEqual(template.preloads, ["/assets/a.js"]);
  assert.deepStrictEqual(template.scripts, ["/assets/index.js"]);
});
