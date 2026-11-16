// scripts/verify-dist-html/links.js
// Loopback and slashless internal link checks.
const { SITE_HOST, decodeXmlEntities } = require("./shared");

const LOOPBACK = /(https?:)?\/\/(127\.0\.0\.1|localhost)(:\d+)?/g;

const loopbackRefs = (dist) =>
  dist.htmlFiles().flatMap((entry) => {
    const hits = dist.read(entry).match(LOOPBACK) || [];
    return hits.map((hit) => `${entry}: ${hit}`);
  });

const slashlessInternalLinks = (dist) =>
  dist.htmlFiles().flatMap((entry) => {
    const html = dist.read(entry);
    return [...html.matchAll(/<a\b[^>]*\bhref=["']([^"']*)["']/gi)].flatMap((match) => {
      const href = decodeXmlEntities(match[1]);
      if (!href.startsWith("/") && !href.startsWith(`https://${SITE_HOST}/`)) return [];
      const pathname = (href.startsWith("/") ? href : href.slice(`https://${SITE_HOST}`.length)).split(/[?#]/, 1)[0];
      if (pathname.startsWith("//") || /\.[a-z0-9]{2,5}$/i.test(pathname.split("/").at(-1) ?? "")) return [];
      return pathname.endsWith("/") ? [] : [`${entry}: ${href}`];
    });
  });

module.exports = {
  LOOPBACK,
  loopbackRefs,
  slashlessInternalLinks,
};
