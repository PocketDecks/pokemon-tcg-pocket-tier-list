const test = require("node:test");
const assert = require("node:assert/strict");
const { buildHubJobs, renderHubHtml } = require("../prerender-deck-hubs");

const template =
  '<!doctype html><html><head><meta charset="utf-8" />' +
  '<meta property="og:type" content="website" />' +
  '<meta name="description" content="old default" />' +
  "<title>Old Title</title></head><body></body></html>";

const archive = [
  {
    variant: "mega-altaria-ex-b1-102",
    hub: "mega-altaria-ex",
    name: "mega-altaria-ex-b1-102",
    firstSeen: "2025-10-31",
    lastSeen: "2026-09-09",
  },
  {
    variant: "greninja-b1-073",
    hub: "greninja",
    name: "Greninja-B1-073",
    firstSeen: "2025-10-31",
    lastSeen: "2025-11-30",
  },
];

test("hub jobs carry the display name of their latest variant", () => {
  const jobs = buildHubJobs(archive, [{ name: "mega-altaria-ex-b1-102" }]);
  const altaria = jobs.find((job) => job.hub === "mega-altaria-ex");
  assert.equal(altaria.name, "Mega Altaria ex");
  assert.equal(altaria.live.length, 1);
});

test("hub pages render a titled, described and breadcrumbed head with no undefined text", () => {
  const jobs = buildHubJobs(archive, [{ name: "mega-altaria-ex-b1-102" }]);
  const altaria = jobs.find((job) => job.hub === "mega-altaria-ex");
  const html = renderHubHtml(altaria, template, "en");
  assert.match(html, /<title>Mega Altaria ex Deck \| Pokemon TCG Pocket<\/title>/);
  assert.match(html, /"name":"Mega Altaria ex"/);
  assert.doesNotMatch(html, /undefined/);
});

test("hub pages keep exactly one website Open Graph type", () => {
  const jobs = buildHubJobs(archive, [{ name: "mega-altaria-ex-b1-102" }]);
  const altaria = jobs.find((job) => job.hub === "mega-altaria-ex");
  const html = renderHubHtml(altaria, template, "en");
  assert.equal((html.match(/property="og:type"/g) ?? []).length, 1);
  assert.ok(html.includes('<meta property="og:type" content="website" />'));
});

test("every English hub is indexable, retired ones included", () => {
  const jobs = buildHubJobs(archive, [{ name: "mega-altaria-ex-b1-102" }]);
  const greninja = jobs.find((job) => job.hub === "greninja");
  assert.match(renderHubHtml(greninja, template, "en"), /name="robots" content="index, follow"/);
  const altaria = jobs.find((job) => job.hub === "mega-altaria-ex");
  assert.match(renderHubHtml(altaria, template, "en"), /name="robots" content="index, follow"/);
});

test("no Japanese hub is indexable, live or retired", () => {
  const jobs = buildHubJobs(archive, [{ name: "mega-altaria-ex-b1-102" }]);
  for (const job of jobs) {
    assert.match(renderHubHtml(job, template, "ja"), /name="robots" content="noindex, follow"/, job.hub);
  }
});

test("Japanese hub breadcrumbs use the Japanese labels", () => {
  const jobs = buildHubJobs(archive, [{ name: "mega-altaria-ex-b1-102" }]);
  const altaria = jobs.find((job) => job.hub === "mega-altaria-ex");
  const japanese = renderHubHtml(altaria, template, "ja");
  assert.match(japanese, /"name":"ホーム"/);
  assert.match(japanese, /"name":"ティアリスト"/);
  assert.doesNotMatch(japanese, /"name":"Home"/);
  assert.doesNotMatch(japanese, /"name":"Tier List"/);
  const english = renderHubHtml(altaria, template, "en");
  assert.match(english, /"name":"Home"/);
  assert.match(english, /"name":"Tier List"/);
});

test("Japanese hub titles and descriptions are localised for live and retired hubs", () => {
  const jobs = buildHubJobs(archive, [{ name: "mega-altaria-ex-b1-102" }]);
  const live = renderHubHtml(jobs.find((job) => job.hub === "mega-altaria-ex"), template, "ja");
  assert.match(live, /<title>Mega Altaria ex デッキ \| ポケポケ デッキレシピと相性<\/title>/);
  assert.match(live, /<meta property="og:title" content="Mega Altaria ex デッキ \| ポケポケ デッキレシピと相性" \/>/);
  assert.match(live, /<meta name="description" content="Mega Altaria exのデッキバリエーション、勝率、メタシェア/);
  assert.match(live, /<meta property="og:description" content="Mega Altaria exのデッキバリエーション/);
  assert.doesNotMatch(live, /Pokemon TCG Pocket deck|Deck \| Pokemon/);
  const retired = renderHubHtml(jobs.find((job) => job.hub === "greninja"), template, "ja");
  assert.match(retired, /<title>Greninja デッキ \| ポケポケ デッキレシピと相性<\/title>/);
  assert.match(retired, /<meta name="description" content="Greninjaのデッキ履歴をまとめたページです。/);
  assert.match(retired, /<meta property="og:description" content="Greninjaのデッキ履歴/);
  assert.doesNotMatch(retired, /現在|最新環境|current meta/);
});
