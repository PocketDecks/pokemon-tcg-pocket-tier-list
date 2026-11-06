const { createHash } = require("node:crypto");

const CSP_HEADER = "Content-Security-Policy";
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

const parsePolicy = (value) => {
  const policy = new Map();
  for (const directive of value.split(";")) {
    const [name, ...sources] = directive.trim().split(/\s+/);
    const normalizedName = name.toLowerCase();
    if (name && !policy.has(normalizedName)) policy.set(normalizedName, sources);
  }
  return policy;
};

const enforcedPolicy = (firebase) =>
  firebase.hosting.headers
    .find((rule) => rule.source === "**")
    ?.headers.find((header) => header.key === CSP_HEADER)?.value;

module.exports = { CSP_HEADER, inlineScriptHashes, parsePolicy, enforcedPolicy };
