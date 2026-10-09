const { createHash } = require("node:crypto");

const REPORT_ONLY_HEADER = "Content-Security-Policy-Report-Only";
const EXECUTABLE_TYPES = new Set(["", "module", "text/javascript", "application/javascript"]);

const hashSource = (body) =>
  `'sha256-${createHash("sha256").update(body, "utf8").digest("base64")}'`;

const inlineScriptHashes = (html) => {
  const hashes = [];
  for (const [, attributes, body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/(?:^|\s)src\s*=/i.test(attributes)) continue;
    const type = (attributes.match(/(?:^|\s)type\s*=\s*["']([^"']*)["']/i)?.[1] ?? "").trim().toLowerCase();
    if (!EXECUTABLE_TYPES.has(type)) continue;
    hashes.push(hashSource(body));
  }
  return [...new Set(hashes)];
};

const parsePolicy = (value) =>
  new Map(
    value
      .split(";")
      .map((directive) => directive.trim().split(/\s+/))
      .filter(([name]) => name)
      .map(([name, ...sources]) => [name, sources])
  );

const reportOnlyPolicy = (firebase) =>
  firebase.hosting.headers
    .find((rule) => rule.source === "**")
    ?.headers.find((header) => header.key === REPORT_ONLY_HEADER)?.value;

module.exports = { REPORT_ONLY_HEADER, inlineScriptHashes, parsePolicy, reportOnlyPolicy };
