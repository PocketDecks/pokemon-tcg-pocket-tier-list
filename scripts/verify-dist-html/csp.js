// scripts/verify-dist-html/csp.js
// External script and Content-Security-Policy checks.
const fs = require("fs");
const { inlineScriptHashes, parsePolicy, enforcedPolicy } = require("../content-security-policy");
const { FIREBASE_CONFIG_PATH, SITE_HOST } = require("./shared");

const isExternalHost = (src) => {
  const match = src.match(/^(?:https?:)?\/\/([^/?#]+)/i);
  if (!match) return false;
  const host = match[1].split("@").pop().split(":")[0].toLowerCase();
  return host !== SITE_HOST;
};

const externalScripts = (dist) =>
  dist.htmlFiles().flatMap((entry) => {
    return [...dist.read(entry).matchAll(/<script\b[^>]*\bsrc=["']([^"']*)["'][^>]*>/gi)]
      .map((match) => match[1])
      .filter(isExternalHost)
      .map((src) => `${entry}: ${src}`);
  });

const cspHashIssues = (
  dist,
  firebase = JSON.parse(fs.readFileSync(FIREBASE_CONFIG_PATH, "utf8"))
) => {
  const policy = enforcedPolicy(firebase);
  if (policy === undefined) {
    return ["firebase.json: no Content-Security-Policy header on **"];
  }
  const parsedPolicy = parsePolicy(policy);
  const directive = [
    "script-src-elem",
    "script-src",
    "default-src",
  ].find((name) => parsedPolicy.has(name)) ?? "script-src";
  const allowed = new Set(parsedPolicy.get(directive) ?? []);
  return dist.htmlFiles().flatMap((entry) =>
    inlineScriptHashes(dist.read(entry))
      .filter((hash) => !allowed.has(hash))
      .map((hash) => `${entry}: ${hash} is not in ${directive}`)
  );
};

const cspBootstrapIssues = (
  dist,
  firebase = JSON.parse(fs.readFileSync(FIREBASE_CONFIG_PATH, "utf8"))
) => {
  const policyValue = enforcedPolicy(firebase);
  if (policyValue === undefined) return ["firebase.json: no Content-Security-Policy header on **"];
  const policy = parsePolicy(policyValue);
  const directive = ["script-src-elem", "script-src", "default-src"].find((name) => policy.has(name));
  const allowed = new Set(directive ? policy.get(directive) : []);
  const issues = [];
  if (!allowed.has("'strict-dynamic'")) {
    issues.push(`${directive ?? "script-src"}: 'strict-dynamic' is missing`);
  }
  if (!dist.has("app.js")) {
    issues.push("app.js: fixed application entry is missing");
  }
  for (const entry of dist.htmlFiles()) {
    const html = dist.read(entry);
    const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
    const bootstraps = scripts.filter(([, attributes]) => /(?:^|\s)data-csp-bootstrap(?:\s|=|$)/i.test(attributes));
    if (bootstraps.length !== 1) {
      issues.push(`${entry}: expected one hash-authorised application bootstrap, found ${bootstraps.length}`);
      continue;
    }
    const [, attributes, body] = bootstraps[0];
    const rootTag = html.match(/<div\b(?=[^>]*\bid=["']root["'])[^>]*>/i);
    if (!rootTag || bootstraps[0].index < rootTag.index) {
      issues.push(`${entry}: bootstrap must follow the application root`);
    }
    if (/\bsrc\s*=/i.test(attributes) || /\btype\s*=/i.test(attributes) || /\bnomodule(?:\s|=|$)/i.test(attributes)) {
      issues.push(`${entry}: bootstrap must be an inline classic script`);
    }
    if (!/createElement\s*\(\s*["']script["']\s*\)/.test(body) ||
        !/\.type\s*=\s*["']module["']/.test(body) ||
        !/\.src\s*=\s*["']\/app\.js["']/.test(body) ||
        !/document\.head\.append\s*\(/.test(body)) {
      issues.push(`${entry}: bootstrap must insert /app.js`);
    }
    const [bootstrapHash] = inlineScriptHashes(`<script>${body}</script>`);
    if (directive === undefined || !allowed.has(bootstrapHash)) {
      issues.push(`${entry}: bootstrap hash is not allowed by ${directive ?? "script-src"}`);
    }
    if (scripts.some(([, scriptAttributes]) => /\bsrc\s*=/i.test(scriptAttributes))) {
      issues.push(`${entry}: parser-inserted external script remains`);
    }
    if (/<link\b(?=[^>]*\brel=["']modulepreload["'])[^>]*>/i.test(html)) {
      issues.push(`${entry}: parser-inserted modulepreload remains`);
    }
  }
  return issues;
};

module.exports = {
  isExternalHost,
  externalScripts,
  cspHashIssues,
  cspBootstrapIssues,
};
