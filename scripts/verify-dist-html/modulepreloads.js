// scripts/verify-dist-html/modulepreloads.js
// Modulepreload drift checks against the built template.
const { deckDetailEntries } = require("./shared");

const collectModulepreloads = (html) =>
  [...html.matchAll(/<link\b[^>]*>/gi)]
    .map((match) => match[0])
    .filter((tag) => /rel=["']modulepreload["']/i.test(tag))
    .map((tag) => (tag.match(/href=["']([^"']*)["']/i) || [])[1])
    .filter((href) => href !== undefined);

const templateModulepreloads = (dist) => {
  const template = deckDetailEntries(dist)[0] ?? (dist.has("index.html") ? "index.html" : undefined);
  return new Set(template === undefined ? [] : collectModulepreloads(dist.read(template)));
};

const sameSet = (a, b) =>
  a.length === b.length && a.every((value, index) => value === b[index]);

const modulepreloadDrift = (dist, templateHrefs = templateModulepreloads(dist)) => {
  const expected = [...templateHrefs].sort();
  return dist.htmlFiles().flatMap((entry) => {
    const actual = [...new Set(collectModulepreloads(dist.read(entry)))].sort();
    return sameSet(actual, expected)
      ? []
      : [`${entry}: ${actual.join(", ")}`];
  });
};

module.exports = {
  collectModulepreloads,
  templateModulepreloads,
  sameSet,
  modulepreloadDrift,
};
