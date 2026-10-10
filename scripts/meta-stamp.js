// scripts/meta-stamp.js
//
// Shared per-route <head> surgery for both prerenderers. The template ships
// without a canonical tag; anything stamped here is authoritative for the page.
const SITE_URL = "https://pocketdecks.top";

const escapeXml = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const stampHead = (
  html,
  { title, description, canonical, robots, jsonLd, metas, alternates, lang } = {}
) => {
  if (!/<\/head>/i.test(html)) throw new Error("No </head> in template");
  let out = html;
  if (lang) {
    out = out.replace(/<html\b[^>]*>/i, (tag) =>
      /\slang=/i.test(tag)
        ? tag.replace(/\slang=["'][^"']*["']/i, ` lang="${escapeXml(lang)}"`)
        : tag.replace(/>$/, ` lang="${escapeXml(lang)}">`)
    );
  }
  if (title) out = out.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeXml(title)}</title>`);
  if (description) {
    out = out.replace(/<meta[^>]+name="description"[^>]*>/gi, "");
    out = out.replace(/<\/head>/i, `  <meta name="description" content="${escapeXml(description)}">\n  </head>`);
  }
  if (robots) {
    out = out.replace(/<meta[^>]+name="robots"[^>]*>/gi, "");
    out = out.replace(/<\/head>/i, `  <meta name="robots" content="${escapeXml(robots)}">\n  </head>`);
  }
  if (metas) {
    for (const attr of [
      "og:title",
      "og:description",
      "og:image",
      "og:url",
      "twitter:title",
      "twitter:description",
      "twitter:image",
      "twitter:card",
    ]) {
      out = out.replace(
        new RegExp(`<meta[^>]+(?:property|name)="${attr}"[^>]*>`, "gi"),
        ""
      );
    }
    const metaLines = metas.map((m) => `    ${m}`).join("\n");
    out = out.replace(/<\/head>/i, `${metaLines}\n  </head>`);
  }
  if (canonical) {
    out = out.replace(/<link[^>]+rel="canonical"[^>]*>/gi, "");
    out = out.replace(/<\/head>/i, `  <link rel="canonical" href="${escapeXml(canonical)}">\n  </head>`);
  }
  if (alternates) {
    out = out.replace(/<link[^>]+rel="alternate"[^>]*>/gi, "");
    const lines = alternates
      .map(
        (alternate) =>
          `  <link rel="alternate" hreflang="${escapeXml(alternate.hreflang)}" href="${escapeXml(alternate.href)}">`
      )
      .join("\n");
    out = out.replace(/<\/head>/i, `${lines}\n  </head>`);
  }
  if (jsonLd) {
    // Raw quotes are correct inside a script tag; do not XML-escape JSON.
    // Angle brackets and ampersands ARE escaped so a value containing "</script>"
    // cannot close the block early.
    const json = JSON.stringify(jsonLd)
      .replace(/&/g, "\\u0026")
      .replace(/</g, "\\u003c")
      .replace(/>/g, "\\u003e");
    const block = `  <script type="application/ld+json">${json}</script>\n  </head>`;
    out = out.replace(/<\/head>/i, block);
  }
  return out;
};

module.exports = { stampHead, escapeXml, SITE_URL };
