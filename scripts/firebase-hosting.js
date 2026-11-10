const escapeRegExp = (value) => value.replace(/[.+?^${}()|[\]\\]/g, "\\$&");

const expandBraces = (source) => {
  const match = source.match(/^(.*)\{([^{}]+)\}(.*)$/);
  if (!match) return [source];
  return match[2].split(",").flatMap((part) => expandBraces(`${match[1]}${part}${match[3]}`));
};

const sourceMatcher = (source) => {
  const exact = !/[{}*]/.test(source);
  const exactSource = exact ? source.replace(/\/$/, "") : source;
  const patterns = expandBraces(exactSource).map((expanded) => {
    const wildcardTail = expanded.endsWith("/**");
    const base = wildcardTail ? expanded.slice(0, -2) : expanded;
    const body = base.split("*").map(escapeRegExp).join("[^/]*");
    return new RegExp(`^${body}${wildcardTail ? ".*" : exact ? "/?" : ""}$`);
  });
  return (requestPath) => patterns.some((pattern) => pattern.test(requestPath));
};

const matchRule = (rules = [], requestPath) =>
  rules.find((rule) =>
    rule.regex ? new RegExp(rule.regex).test(requestPath) : sourceMatcher(rule.source)(requestPath)
  );

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
