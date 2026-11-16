const fs = require("fs");
const path = require("path");
const { deckNameToIconIds } = require("./deck-name.mjs");
const { deckSlug } = require("./deck-slug.mjs");
const { loadPremiumDeckSlugs } = require("./premium-deck-slugs.mjs");
const { PREMIUM_BASES, PREMIUM_WINDOWS, windowArtefactName } = require("./meta-windows.mjs");
const { localeRoute, LOCALE_PREFIXES, ROUTE_LOCALES } = require("./locale-route.mjs");
const {
  CARD_THUMB_WIDTHS,
  DECK_THUMB_SIZES,
  DECK_THUMB_VERSION,
  deckListCardIds,
  firstBestListCardId,
} = require("./deck-thumbs.mjs");
const { resolveHosting } = require("./firebase-hosting");
const { inlineScriptHashes, parsePolicy, enforcedPolicy } = require("./content-security-policy");
const { DELUXE_EXPANSION_IDS, expansionCode, newestExpansion } = require("../src/app/expansion-policy.mjs");
const { expansionIndexPolicy } = require("../src/app/expansion-index-policy.mjs");
const { shouldIndexHub } = require("./deck-archive-policy.mjs");
const { hubDisplayName } = require("./deck-archetype.mjs");
const { PAGE_ROUTES } = require("./routes.mjs");

const DIST_DIR = process.env.BUILD_DIR
  ? path.resolve(process.env.BUILD_DIR)
  : path.join(__dirname, "..", "dist");
const FIREBASE_CONFIG_PATH = path.join(__dirname, "..", "firebase.json");
const DATA_DIR = process.env.BUILD_DIR
  ? path.join(DIST_DIR, "data")
  : path.join(__dirname, "..", "public", "data");
const SITE_HOST = "pocketdecks.top";
const LOOPBACK = /(https?:)?\/\/(127\.0\.0\.1|localhost)(:\d+)?/g;

const PREMIUM_DATA_FILES = PREMIUM_BASES.flatMap((base) =>
  PREMIUM_WINDOWS.map((window) => `${windowArtefactName(base, window)}.json`)
);

const premiumDataFiles = (dist) => {
  if (!dist.has("data")) return [];
  return dist
    .files()
    .filter((entry) => entry.split(path.sep)[0] === "data" && PREMIUM_DATA_FILES.includes(path.basename(entry)));
};

const premiumDeckSlugList = () => Object.keys(loadPremiumDeckSlugs());

const posixEntry = (entry) => entry.split(path.sep).join("/");

const localeEntryPrefix = (locale) => localeRoute(locale, "/").slice(1);
const LOCALE_ENTRY_PREFIXES = ROUTE_LOCALES.map(localeEntryPrefix);

const deckPageEntries = (slug) => LOCALE_ENTRY_PREFIXES.map((prefix) => `${prefix}deck/${slug}/index.html`);

const premiumShellEntries = (slugs) => new Set(slugs.flatMap(deckPageEntries));

// One listing and one read per page for every check that shares the reader.
const openDist = (dir) => {
  const pages = new Map();
  let files;
  const listFiles = () =>
    (files ??= fs
      .readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name))));
  return {
    dir,
    files: listFiles,
    htmlFiles: () => listFiles().filter((entry) => entry.endsWith(".html")),
    read: (entry) => {
      const key = path.normalize(entry);
      if (!pages.has(key)) pages.set(key, fs.readFileSync(path.join(dir, key), "utf8"));
      return pages.get(key);
    },
    has: (entry) => fs.existsSync(path.join(dir, entry)),
  };
};

const forDir =
  (check) =>
  (dir = DIST_DIR, ...rest) =>
    check(openDist(dir), ...rest);

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

const emptyStyledTags = (dist) =>
  dist.htmlFiles().flatMap((entry) =>
    [...dist.read(entry).matchAll(/<style\b[^>]*data-styled(?:=["'][^"']*["'])?[^>]*>([\s\S]*?)<\/style>/gi)]
      .filter((match) => match[1].trim() === "")
      .map(() => entry)
  );

const BAKED_APP_STATE = ["data-app-visible", "data-consent-pending"];

const bakedAppState = (dist) =>
  dist.htmlFiles().flatMap((entry) => {
    const tag = dist.read(entry).match(/<html(?:\s[^>]*)?>/i)?.[0] ?? "";
    return BAKED_APP_STATE.filter((name) => tag.includes(name)).map(
      (name) => `${entry}: ${name}`
    );
  });

const EMPTY_ROOT = /<div\b[^>]*id=["']root["'][^>]*>\s*<\/div>/i;

const emptyDeckRoots = (dist, shellSlugs = premiumDeckSlugList()) =>
  deckDetailEntries(dist, shellSlugs).filter((entry) => EMPTY_ROOT.test(dist.read(entry)));

const hasCapturedStyles = (html) =>
  [...html.matchAll(/<style\b[^>]*data-styled[^>]*>([\s\S]*?)<\/style>/gi)].some(
    (match) => match[1].trim() !== ""
  );

const uncapturedDeckStyles = (dist, shellSlugs = premiumDeckSlugList()) =>
  deckDetailEntries(dist, shellSlugs).filter((entry) => !hasCapturedStyles(dist.read(entry)));

const CANONICAL_TAG = /<link\b[^>]*\brel=["']canonical["'][^>]*>/gi;

const decodeXmlEntities = (value) =>
  value
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

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

const metaContent = (html, name) => {
  const tag = (html.match(/<meta\b[^>]*>/gi) ?? []).find((candidate) =>
    new RegExp(`\\bname=["']${name}["']`, "i").test(candidate)
  );
  return tag === undefined ? [] : [decodeXmlEntities(tag.match(/\bcontent=["']([^"']*)["']/i)?.[1] ?? "")];
};

const hubHtmlIssues = (entry, html, expectedRobots, expectedName) => {
  const issues = [];
  const canonicals = html.match(CANONICAL_TAG) ?? [];
  if (canonicals.length !== 1) {
    issues.push(`${entry}: expected 1 canonical, found ${canonicals.length}`);
  }
  const robots = (html.match(/<meta\b[^>]*>/gi) ?? [])
    .filter((tag) => /\bname=["']robots["']/i.test(tag))
    .map((tag) => tag.match(/\bcontent=["']([^"']*)["']/i)?.[1] ?? "");
  if (robots.length !== 1 || robots[0] !== expectedRobots) {
    issues.push(`${entry}: robots ${robots.join(",") || "none"} is not ${expectedRobots}`);
  }
  const title = (html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? "").trim();
  const description = (metaContent(html, "description")[0] ?? "").trim();
  const h1 = (html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "").replace(/<[^>]+>/g, "").trim();
  if (!title) issues.push(`${entry}: empty title`);
  if (!description) issues.push(`${entry}: empty description`);
  if (!h1) issues.push(`${entry}: empty H1`);
  else if (!h1.includes(expectedName)) issues.push(`${entry}: H1 "${h1}" does not name ${expectedName}`);
  const jsonLd = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  for (const [label, text] of [["title", title], ["description", description], ["H1", h1], ["breadcrumb", jsonLd.join(" ")]]) {
    if (/\bundefined\b/.test(text)) issues.push(`${entry}: ${label} contains undefined`);
  }
  return issues;
};

const hubPageIssues = (dist, archive = loadArchive(), decks = loadDecks()) => {
  const liveSlugs = new Set(decks.map((deck) => deckSlug(deck.name)));
  const hubs = [...new Set(archive.map((entry) => entry.hub))].filter((hub) => !liveSlugs.has(hub));
  return hubs.flatMap((hub) => {
    const entries = archive.filter((entry) => entry.hub === hub);
    const indexed = shouldIndexHub(entries);
    const name = hubDisplayName(entries);
    return LOCALE_ENTRY_PREFIXES.flatMap((prefix) => {
      const entry = `${prefix}deck/${hub}/index.html`;
      if (!dist.has(entry)) return [`${entry}: missing`];
      const expectedRobots = prefix === "" && indexed ? "index, follow" : "noindex, follow";
      return hubHtmlIssues(entry, dist.read(entry), expectedRobots, name);
    });
  });
};

const expansionPageIssues = (dist, expansions = loadExpansions(), decks = loadDecks()) => {
  const policy = expansionIndexPolicy(expansions, decks);
  const issues = [];
  for (const expansion of expansions.filter((entry) => !DELUXE_EXPANSION_IDS.has(entry.id))) {
    for (const prefix of LOCALE_ENTRY_PREFIXES) {
      const entry = `${prefix}expansion-list/${expansion.id}/index.html`;
      if (!dist.has(entry)) {
        issues.push(`${entry}: missing`);
        continue;
      }
      const html = dist.read(entry);
      const expectedRobots = policy.isIndexable(expansion.id) ? "index, follow" : "noindex, follow";
      issues.push(...hubHtmlIssues(entry, html, expectedRobots, expansionCode(expansion.id)));
      if (!html.includes(`"@type":"BreadcrumbList"`)) issues.push(`${entry}: missing BreadcrumbList JSON-LD`);
    }
  }
  return issues;
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

// Every page route under each locale prefix in LOCALE_PREFIXES, from scripts/routes.mjs.
const appRoutePaths = (routes = PAGE_ROUTES.map(({ route }) => route)) =>
  Object.values(LOCALE_PREFIXES).flatMap((prefix) => [
    prefix || "/",
    ...routes.filter((route) => route !== "/").map((route) => `${prefix}${route}`),
  ]);

const unresolvedAppRoutes = (
  dist,
  {
    routes = PAGE_ROUTES.map(({ route }) => route),
    firebase = JSON.parse(fs.readFileSync(FIREBASE_CONFIG_PATH, "utf8")),
  } = {}
) => {
  const files = new Set(dist.files().map(posixEntry));
  return appRoutePaths(routes)
    .filter((route) => !route.includes("*"))
    .flatMap((route) => {
      if (route.includes("/:")) {
        const prefix = route.slice(1, route.indexOf("/:"));
        const depth = prefix.split("/").length + 2;
        const hasPage = [...files].some(
          (file) =>
            file.startsWith(`${prefix}/`) &&
            file.split("/").length === depth &&
            file.endsWith("/index.html")
        );
        return hasPage ? [] : [`${route}: no prerendered page under /${prefix}/`];
      }
      const resolved = resolveHosting(firebase, files, route);
      if (resolved.kind === "not-found") return [`${route}: no file, redirect or rewrite`];
      if (resolved.kind === "redirect") {
        const destination = resolveHosting(firebase, files, resolved.location);
        if (destination.kind === "rewrite" && !files.has(destination.file)) {
          return [`${resolved.location}: rewrite target ${destination.file} is not built`];
        }
        if (
          destination.kind !== "file" &&
          !(destination.kind === "rewrite" && files.has(destination.file))
        ) {
          return [`${route}: redirect to ${resolved.location} does not resolve`];
        }
      }
      if (resolved.kind === "rewrite" && !files.has(resolved.file)) {
        return [`${route}: rewrite target ${resolved.file} is not built`];
      }
      if (resolved.kind === "redirect") return [];
      const slashedRoute = route === "/" ? "/" : `${route}/`;
      const slashed = resolveHosting(firebase, files, slashedRoute);
      if (slashed.kind === "not-found") return [`${slashedRoute}: no file, redirect or rewrite`];
      if (slashed.kind === "rewrite" && !files.has(slashed.file)) {
        return [`${slashedRoute}: rewrite target ${slashed.file} is not built`];
      }
      return [];
    });
};

const collectModulepreloads = (html) =>
  [...html.matchAll(/<link\b[^>]*>/gi)]
    .map((match) => match[0])
    .filter((tag) => /rel=["']modulepreload["']/i.test(tag))
    .map((tag) => (tag.match(/href=["']([^"']*)["']/i) || [])[1])
    .filter((href) => href !== undefined);

const deckDetailEntries = (dist, shellSlugs = premiumDeckSlugList()) => {
  if (!fs.existsSync(dist.dir)) return [];
  const shells = premiumShellEntries(shellSlugs);
  return dist
    .htmlFiles()
    .filter((entry) => {
      const segments = entry.split(path.sep);
      return segments.length >= 3 && segments.at(-1) === "index.html" && segments.at(-3) === "deck";
    })
    .filter((entry) => !shells.has(posixEntry(entry)))
    .sort();
};

const defaultOtherDeckSlugs = () => {
  const live = loadDecks().map((deck) => deckSlug(deck.name));
  const hubs = loadArchive().map((entry) => entry.hub);
  return new Set([...live, ...hubs]);
};

const premiumShellIssues = (
  dist,
  { slugs = premiumDeckSlugList(), otherSlugs = defaultOtherDeckSlugs() } = {}
) => {
  const expected = [...premiumShellEntries(slugs)];
  const issues = expected.flatMap((entry) => {
    const local = entry.split("/").join(path.sep);
    if (!dist.has(entry)) return [`${local}: missing`];
    const html = dist.read(entry);
    const robots = (html.match(/<meta\b[^>]*>/gi) ?? []).filter((tag) => /\bname=["']robots["']/i.test(tag));
    return [
      ...(robots.some((tag) => /\bnoindex\b/i.test(tag)) ? [] : [`${local}: no noindex robots meta`]),
      ...((html.match(CANONICAL_TAG) ?? []).length > 0 ? [`${local}: has a canonical`] : []),
      ...(/<link\b[^>]*\bhreflang=/i.test(html) ? [`${local}: has alternates`] : []),
      ...(EMPTY_ROOT.test(html) ? [] : [`${local}: carries rendered content`]),
    ];
  });
  const allowed = new Set([...expected, ...[...otherSlugs].flatMap(deckPageEntries)]);
  const extras = deckDetailEntries(dist, [])
    .map(posixEntry)
    .filter((entry) => !allowed.has(entry))
    .map((entry) => `${entry.split("/").join(path.sep)}: unexpected deck page`);
  return [...issues, ...extras];
};

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

const loadDecks = (dataDir = DATA_DIR) => {
  const decksPath = path.join(dataDir, "best-decks.json");
  try {
    return JSON.parse(fs.readFileSync(decksPath, "utf8"));
  } catch (error) {
    throw new Error(`Unable to load deck data from ${decksPath}: ${error.message}`, {
      cause: error,
    });
  }
};

const loadArchive = (dataDir = DATA_DIR) =>
  JSON.parse(fs.readFileSync(path.join(dataDir, "deck-archive.json"), "utf8"));

const loadExpansions = () =>
  require("pokemon-tcg-pocket-cards/data/v5/expansions.json");

const EXPANSION_LIST_ENTRY = "expansion-list/index.html";
const EXPANSIONS_OPTION_LABEL = Object.fromEntries(
  ROUTE_LOCALES.map((locale) => [
    `${localeEntryPrefix(locale)}${EXPANSION_LIST_ENTRY}`,
    require(`../src/locales/${locale}_translation.json`).expansionList.viewExpansions,
  ])
);

const imageSrcs = (html) =>
  [...html.matchAll(/<img\b[^>]*\ssrc=["']([^"']*)["']/gi)].map((match) => match[1]);

const toggleButtons = (html) =>
  [...html.matchAll(/<button\b[^>]*\baria-pressed="(true|false)"[^>]*>([^<]*)<\/button>/gi)].map(
    (match) => ({ pressed: match[1], label: match[2] })
  );

const findDefaultViewIssues = (entry, html) => {
  const issues = [];
  const expansions = toggleButtons(html).find((button) => button.label === EXPANSIONS_OPTION_LABEL[entry]);
  if (!expansions) {
    issues.push(`${entry}: missing the Expansions option`);
  } else if (expansions.pressed !== "true") {
    issues.push(`${entry}: the Expansions option is not pressed by default`);
  }
  if (/href=["'][^"']*\?pack=/i.test(html)) {
    issues.push(`${entry}: a tile links to a pack filter`);
  }
  return issues;
};

const expansionListIssues = (dist, list = loadExpansions()) => {
  const sources = imageSrcs(dist.read(EXPANSION_LIST_ENTRY));
  const newest = newestExpansion(list);
  const issues = [];
  if (!newest) {
    issues.push(`${EXPANSION_LIST_ENTRY}: no eligible expansion`);
  } else if (!sources.some((src) => src.includes(`/packs/${newest.id}-`))) {
    issues.push(`${EXPANSION_LIST_ENTRY}: missing the newest set /packs/${newest.id}-`);
  }
  for (const id of DELUXE_EXPANSION_IDS) {
    if (sources.some((src) => src.includes(`/packs/${id}-`))) {
      issues.push(`${EXPANSION_LIST_ENTRY}: deluxe pack /packs/${id}- is listed`);
    }
  }
  for (const entry of Object.keys(EXPANSIONS_OPTION_LABEL)) {
    if (!dist.has(entry)) {
      issues.push(`${entry}: missing`);
    } else {
      issues.push(...findDefaultViewIssues(entry, dist.read(entry)));
    }
  }
  return issues;
};

const findMissingDeckThumbs = (dir = DIST_DIR, decks = loadDecks()) => {
  const thumbDir = path.join(dir, "thumbs", `v${DECK_THUMB_VERSION}`);
  const ids = new Set();
  for (const deck of decks) {
    for (const id of deckNameToIconIds(deck.name)) ids.add(id);
  }
  return [...ids].flatMap((id) =>
    DECK_THUMB_SIZES.filter(
      (size) => !fs.existsSync(path.join(thumbDir, `${id}-${size}.webp`))
    ).map((size) => `${id}-${size}`)
  );
};

const findMissingCardThumbs = (dir = DIST_DIR, decks = loadDecks()) => {
  const cardDir = path.join(dir, "thumbs", `v${DECK_THUMB_VERSION}`, "cards");
  return deckListCardIds(decks).flatMap((id) =>
    CARD_THUMB_WIDTHS.filter(
      (width) => !fs.existsSync(path.join(cardDir, `${id}-${width}.webp`))
    ).map((width) => `${id}-${width}`)
  );
};

const collectImagePreloads = (html) =>
  [...html.matchAll(/<link\b[^>]*>/gi)]
    .map((match) => match[0])
    .filter((tag) => /rel=["']preload["']/i.test(tag) && /as=["']image["']/i.test(tag));

const imageCandidates = (tag) =>
  (tag.match(/imagesrcset=["']([^"']*)["']/i)?.[1] ?? "")
    .split(",")
    .map((candidate) => candidate.trim().split(/\s+/)[0])
    .filter(Boolean);

const cardlessDeckSlugs = (decks = loadDecks()) =>
  new Set(decks.filter((deck) => firstBestListCardId(deck) === null).map((deck) => deckSlug(deck.name)));

const deckImagePreloadIssues = (
  dist,
  hubSlugs = new Set(loadArchive().map((entry) => entry.hub)),
  cardlessSlugs = new Set()
) =>
  deckDetailEntries(dist)
    .filter((entry) => !hubSlugs.has(path.basename(path.dirname(entry))))
    .flatMap((entry) => {
    const tags = collectImagePreloads(dist.read(entry));
    const expected = cardlessSlugs.has(path.basename(path.dirname(entry))) ? 0 : 1;
    if (tags.length !== expected) {
      return [`${entry}: expected ${expected} image preload${expected === 1 ? "" : "s"}, found ${tags.length}`];
    }
    if (expected === 0) return [];
    return imageCandidates(tags[0]).flatMap((candidate) => {
      const url = candidate.split("?")[0];
      if (!url.startsWith("/thumbs/")) return [`${entry}: ${candidate} is outside /thumbs/`];
      return dist.has(url) ? [] : [`${entry}: ${url} is not built`];
    });
  });

const findMissingLiveDeckPages = (dir = DIST_DIR, decks = loadDecks()) =>
  decks.flatMap((deck) => {
    return deckPageEntries(deckSlug(deck.name))
      .filter((entry) => !fs.existsSync(path.join(dir, entry)))
      .map((entry) => `${entry}: missing`);
  });

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

const CHECKS = [
  {
    heading: "Live decks without a prerendered page:",
    find: (dist) => findMissingLiveDeckPages(dist.dir),
  },
  { heading: "Loopback origins found in built HTML:", find: (dist) => loopbackRefs(dist) },
  {
    heading: "Internal links without a trailing slash in built HTML:",
    find: (dist) => slashlessInternalLinks(dist),
  },
  {
    heading: "Duplicate or non-canonical Open Graph metadata in built HTML:",
    find: (dist) => openGraphIssues(dist),
  },
  { heading: "Empty styled-components CSS found in built HTML:", find: (dist) => emptyStyledTags(dist) },
  { heading: "Empty deck roots found in built HTML:", find: (dist) => emptyDeckRoots(dist) },
  {
    heading: "Deck pages without captured styled-components CSS:",
    find: (dist) => uncapturedDeckStyles(dist),
  },
  { heading: "Built pages without exactly one title:", find: (dist) => titleCountIssues(dist) },
  {
    heading: "Pages without exactly one canonical of their own:",
    find: (dist) => canonicalIssues(dist),
  },
  { heading: "Deck hub pages failing the head or copy checks:", find: (dist) => hubPageIssues(dist) },
  {
    heading: "Expansion pages failing the head or coverage checks:",
    find: (dist) => expansionPageIssues(dist),
  },
  { heading: "Premium window data shipped in the build output:", find: (dist) => premiumDataFiles(dist) },
  {
    heading: "Premium deck shells must match the slug list exactly:",
    find: (dist) => premiumShellIssues(dist),
  },
  {
    heading: "404 and app-shell pages must be noindex without a canonical:",
    find: (dist) => shellPageIssues(dist),
  },
  {
    heading: "Expansion list missing the newest set or showing a deluxe pack:",
    find: (dist) => expansionListIssues(dist),
  },
  {
    heading: "App routes with no built file, redirect or explicit rewrite:",
    find: (dist) => unresolvedAppRoutes(dist),
  },
  {
    heading: "Live app state baked into the <html> tag of built HTML:",
    find: (dist) => bakedAppState(dist),
  },
  { heading: "Modulepreload sets drifting from the template:", find: (dist) => modulepreloadDrift(dist) },
  {
    heading: "Script tags pointing at another host in built HTML:",
    find: (dist) => externalScripts(dist),
  },
  {
    heading: "Inline scripts missing from the enforced Content-Security-Policy in firebase.json:",
    find: (dist) => cspHashIssues(dist),
  },
  {
    heading: "Untrusted or missing application bootstrap in built HTML:",
    find: (dist) => cspBootstrapIssues(dist),
  },
  {
    heading: "Deck page image preloads without a built file:",
    find: (dist) => deckImagePreloadIssues(dist, undefined, cardlessDeckSlugs()),
  },
  {
    heading: "Deck icon ids without a built thumbnail:",
    find: (dist) => findMissingDeckThumbs(dist.dir),
    describeError: (error) => `Deck thumbnail check failed: ${error.message}`,
  },
  {
    heading: "Deck card ids without a built card thumbnail:",
    find: (dist) => findMissingCardThumbs(dist.dir),
    describeError: (error) => `Deck thumbnail check failed: ${error.message}`,
  },
];

const main = () => {
  const dist = openDist(DIST_DIR);
  let failed = false;
  for (const { heading, find, describeError } of CHECKS) {
    try {
      const entries = find(dist);
      if (entries.length > 0) {
        console.error(`${heading}\n${entries.join("\n")}`);
        failed = true;
      }
    } catch (error) {
      if (describeError === undefined) throw error;
      console.error(describeError(error));
      failed = true;
    }
  }
  if (failed) process.exit(1);
  console.log(`No loopback origins in ${DIST_DIR}`);
};

if (require.main === module) main();

module.exports = {
  PREMIUM_DATA_FILES,
  findPremiumDataFiles: forDir(premiumDataFiles),
  findPremiumShellIssues: forDir(premiumShellIssues),
  findBakedAppState: forDir(bakedAppState),
  findHubPageIssues: forDir(hubPageIssues),
  findExpansionPageIssues: forDir(expansionPageIssues),
  findCanonicalIssues: forDir(canonicalIssues),
  findCspHashIssues: forDir(cspHashIssues),
  findCspBootstrapIssues: forDir(cspBootstrapIssues),
  findShellPageIssues: forDir(shellPageIssues),
  findTitleCountIssues: forDir(titleCountIssues),
  appRoutePaths,
  findUnresolvedAppRoutes: forDir(unresolvedAppRoutes),
  findDeckImagePreloadIssues: forDir(deckImagePreloadIssues),
  findEmptyDeckRoots: forDir(emptyDeckRoots),
  findEmptyStyledTags: forDir(emptyStyledTags),
  findExpansionListIssues: forDir(expansionListIssues),
  findExternalScripts: forDir(externalScripts),
  findLoopbackRefs: forDir(loopbackRefs),
  findSlashlessInternalLinks: forDir(slashlessInternalLinks),
  findOpenGraphIssues: forDir(openGraphIssues),
  findMissingCardThumbs,
  findMissingLiveDeckPages,
  findMissingDeckThumbs,
  findModulepreloadDrift: forDir(modulepreloadDrift),
  findUncapturedDeckStyles: forDir(uncapturedDeckStyles),
  loadDecks,
  loadExpansions,
  findTemplateModulepreloads: forDir(templateModulepreloads),
};
