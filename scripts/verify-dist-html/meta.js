// scripts/verify-dist-html/meta.js
// Title, canonical, Open Graph and shell page checks.
const path = require("path");
const { CANONICAL_TAG, SITE_HOST, decodeXmlEntities, posixEntry, premiumDeckSlugList, premiumShellEntries } = require("./shared");

const openGraphIssues = (dist) =>
  dist.htmlFiles().flatMap((entry) => {
    const html = dist.read(entry);
    const head = html.match(HEAD_BLOCK)?.[0] ?? html;
    const canonicals = head.match(CANONICAL_TAG) ?? [];
    if (canonicals.length === 0) return [];
    const metas = [...head.matchAll(/<meta\b[^>]*>/gi)].map((match) => match[0]);
    const urls = metas
      .filter((tag) => /\bproperty=["']og:url["']/i.test(tag))
      .map((tag) => decodeXmlEntities(tag.match(/\bcontent=["']([^"']*)["']/i)?.[1] ?? ""));
    const titles = metas.filter((tag) => /\bproperty=["']og:title["']/i.test(tag));
    const issues = [];
    if (urls.length > 1) issues.push(`${entry}: expected at most 1 og:url, found ${urls.length}`);
    if (titles.length > 1) issues.push(`${entry}: expected at most 1 og:title, found ${titles.length}`);
    if (urls.length === 1 && canonicals.length > 0) {
      const canonical = decodeXmlEntities(canonicals[0].match(/\bhref=["']([^"']*)["']/i)?.[1] ?? "");
      if (urls[0] !== canonical) {
        issues.push(`${entry}: og:url ${urls[0]} differs from canonical ${canonical}`);
      }
    }
    return issues;
  });

const SHELL_PAGES = new Set(["404.html", "app-shell.html"]);

const expectedCanonical = (entry) => {
  const dir = path.posix.dirname(entry.split(path.sep).join("/"));
  return dir === "." ? `https://${SITE_HOST}/` : `https://${SITE_HOST}/${dir}/`;
};

const canonicalIssues = (dist, shellSlugs = premiumDeckSlugList()) => {
  const shells = premiumShellEntries(shellSlugs);
  return dist
    .htmlFiles()
    .filter((entry) => !SHELL_PAGES.has(entry) && !shells.has(posixEntry(entry)))
    .flatMap((entry) => {
      const tags = dist.read(entry).match(CANONICAL_TAG) ?? [];
      if (tags.length !== 1) {
        return [`${entry}: expected 1 canonical, found ${tags.length}`];
      }
      const href = decodeXmlEntities(tags[0].match(/\bhref=["']([^"']*)["']/i)?.[1] ?? "");
      const expected = expectedCanonical(entry);
      return href === expected ? [] : [`${entry}: canonical ${href} is not ${expected}`];
    });
};

const HEAD_BLOCK = /<head\b[^>]*>[\s\S]*?<\/head>/i;

const TITLE_TAG = /<title\b[^>]*>[\s\S]*?<\/title>/gi;

const titleCountIssues = (dist) =>
  dist.htmlFiles().flatMap((entry) => {
    const count = (dist.read(entry).match(HEAD_BLOCK)?.[0].match(TITLE_TAG) ?? []).length;
    return count === 1 ? [] : [`${entry}: expected 1 title, found ${count}`];
  });

const shellPageIssues = (dist) =>
  [...SHELL_PAGES].flatMap((entry) => {
    if (!dist.has(entry)) return [`${entry}: missing`];
    const html = dist.read(entry);
    const robots = (html.match(/<meta\b[^>]*>/gi) ?? []).filter((tag) => /\bname=["']robots["']/i.test(tag));
    const issues = [];
    if (!robots.some((tag) => /\bnoindex\b/i.test(tag))) issues.push(`${entry}: no noindex robots meta`);
    if ((html.match(CANONICAL_TAG) ?? []).length > 0) issues.push(`${entry}: has a canonical`);
    return issues;
  });

module.exports = {
  openGraphIssues,
  SHELL_PAGES,
  expectedCanonical,
  canonicalIssues,
  HEAD_BLOCK,
  TITLE_TAG,
  titleCountIssues,
  shellPageIssues,
};
