const escapeRegExp = (value) => value.replace(/[.+?^${}()|[\]\\]/g, "\\$&");

const sourceMatcher = (source) => {
  const wildcardTail = source.endsWith("/**");
  const base = wildcardTail ? source.slice(0, -3) : source;
  const body = base.split("*").map(escapeRegExp).join("[^/]*");
  const pattern = new RegExp(`^${body}${wildcardTail ? "(?:/.*)?" : ""}$`);
  return (requestPath) => pattern.test(requestPath);
};

const matchRule = (rules = [], requestPath) =>
  rules.find((rule) => sourceMatcher(rule.source)(requestPath));

const resolveStatic = (files, requestPath) => {
  const relative = requestPath.slice(1);
  if (requestPath.endsWith("/")) {
    const index = `${relative}index.html`;
    return files.has(index) ? { kind: "file", file: index, status: 200 } : null;
  }
  if (files.has(relative)) return { kind: "file", file: relative, status: 200 };
  if (files.has(`${relative}/index.html`)) {
    return { kind: "redirect", status: 301, location: `${requestPath}/` };
  }
  return null;
};

const resolveHosting = (config, files, requestPath) => {
  const { redirects, rewrites } = config.hosting;
  const redirect = matchRule(redirects, requestPath);
  if (redirect) {
    return { kind: "redirect", status: redirect.type ?? 301, location: redirect.destination };
  }
  const staticMatch = resolveStatic(files, requestPath);
  if (staticMatch) return staticMatch;
  const rewrite = matchRule(rewrites, requestPath);
  if (rewrite) {
    return { kind: "rewrite", status: 200, file: rewrite.destination.replace(/^\//, "") };
  }
  return { kind: "not-found", status: 404, file: "404.html" };
};

module.exports = { resolveHosting, sourceMatcher };
