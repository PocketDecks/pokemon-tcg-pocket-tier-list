const fs = require("fs");
const path = require("path");
const { deckNameToIconIds } = require("./deck-name.mjs");
const { deckSlug } = require("./deck-slug.mjs");
const { loadPremiumDeckSlugs } = require("./premium-deck-slugs.mjs");
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

const DIST_DIR = process.env.BUILD_DIR
  ? path.resolve(process.env.BUILD_DIR)
  : path.join(__dirname, "..", "dist");
const APP_SOURCE_PATH = path.join(__dirname, "..", "src", "App.tsx");
const FIREBASE_CONFIG_PATH = path.join(__dirname, "..", "firebase.json");
const DATA_DIR = process.env.BUILD_DIR
  ? path.join(DIST_DIR, "data")
  : path.join(__dirname, "..", "public", "data");
const SITE_HOST = "pocketdecks.top";
const LOOPBACK = /(https?:)?\/\/(127\.0\.0\.1|localhost)(:\d+)?/g;

const PREMIUM_DATA_FILES = ["best-decks", "matchup-data", "meta-share"].flatMap((base) =>
  ["30d", "all"].map((window) => `${base}-${window}.json`)
);

const findPremiumDataFiles = (dir = DIST_DIR) => {
  const dataDir = path.join(dir, "data");
  if (!fs.existsSync(dataDir)) return [];
  return fs
    .readdirSync(dataDir, { recursive: true })
    .filter((entry) => PREMIUM_DATA_FILES.includes(path.basename(entry)))
    .map((entry) => path.join("data", entry));
};

const premiumDeckSlugList = () => Object.keys(loadPremiumDeckSlugs());

const posixEntry = (entry) => entry.split(path.sep).join("/");

const premiumShellEntries = (slugs) =>
  new Set(["", "ja/"].flatMap((prefix) => slugs.map((slug) => `${prefix}deck/${slug}/index.html`)));

const listHtmlFiles = (dir = DIST_DIR) =>
  fs.readdirSync(dir, { recursive: true }).filter((entry) => entry.endsWith(".html"));

const findLoopbackRefs = (dir = DIST_DIR) =>
  fs
    .readdirSync(dir, { recursive: true })
    .filter((entry) => entry.endsWith(".html"))
    .flatMap((entry) => {
      const file = path.join(dir, entry);
      const hits = fs.readFileSync(file, "utf8").match(LOOPBACK) || [];
      return hits.map((hit) => `${entry}: ${hit}`);
    });

const findSlashlessInternalLinks = (dir = DIST_DIR) =>
  listHtmlFiles(dir).flatMap((entry) => {
    const html = fs.readFileSync(path.join(dir, entry), "utf8");
    return [...html.matchAll(/<a\b[^>]*\bhref=["']([^"']*)["']/gi)].flatMap((match) => {
      const href = decodeXmlEntities(match[1]);
      if (!href.startsWith("/") && !href.startsWith(`https://${SITE_HOST}/`)) return [];
      const pathname = (href.startsWith("/") ? href : href.slice(`https://${SITE_HOST}`.length)).split(/[?#]/, 1)[0];
      if (pathname.startsWith("//") || pathname.startsWith("/cdn-cgi/") || /\.[a-z0-9]{2,5}$/i.test(pathname.split("/").at(-1) ?? "")) return [];
      return pathname.endsWith("/") ? [] : [`${entry}: ${href}`];
    });
  });

const findOpenGraphIssues = (dir = DIST_DIR) =>
  listHtmlFiles(dir).flatMap((entry) => {
    const html = fs.readFileSync(path.join(dir, entry), "utf8");
    const head = html.match(HEAD_BLOCK)?.[0] ?? html;
    const metas = [...head.matchAll(/<meta\b[^>]*>/gi)].map((match) => match[0]);
    const urls = metas
      .filter((tag) => /\bproperty=["']og:url["']/i.test(tag))
      .map((tag) => decodeXmlEntities(tag.match(/\bcontent=["']([^"']*)["']/i)?.[1] ?? ""));
    const titles = metas.filter((tag) => /\bproperty=["']og:title["']/i.test(tag));
    const canonicals = head.match(CANONICAL_TAG) ?? [];
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

const findEmptyStyledTags = (dir = DIST_DIR) =>
  fs
    .readdirSync(dir, { recursive: true })
    .filter((entry) => entry.endsWith(".html"))
    .flatMap((entry) => {
      const file = path.join(dir, entry);
      const html = fs.readFileSync(file, "utf8");
      return [...html.matchAll(/<style\b[^>]*data-styled(?:=["'][^"']*["'])?[^>]*>([\s\S]*?)<\/style>/gi)]
        .filter((match) => match[1].trim() === "")
        .map(() => entry);
    });

const BAKED_APP_STATE = ["data-app-visible", "data-consent-pending"];

const findBakedAppState = (dir = DIST_DIR) =>
  listHtmlFiles(dir).flatMap((entry) => {
    const html = fs.readFileSync(path.join(dir, entry), "utf8");
    const tag = html.match(/<html(?:\s[^>]*)?>/i)?.[0] ?? "";
    return BAKED_APP_STATE.filter((name) => tag.includes(name)).map(
      (name) => `${entry}: ${name}`
    );
  });

const EMPTY_ROOT = /<div\b[^>]*id=["']root["'][^>]*>\s*<\/div>/i;

const findEmptyDeckRoots = (dir = DIST_DIR, shellSlugs = premiumDeckSlugList()) =>
  deckDetailFiles(dir, shellSlugs)
    .filter((file) => EMPTY_ROOT.test(fs.readFileSync(file, "utf8")))
    .map((file) => path.relative(dir, file));

const hasCapturedStyles = (html) =>
  [...html.matchAll(/<style\b[^>]*data-styled[^>]*>([\s\S]*?)<\/style>/gi)].some(
    (match) => match[1].trim() !== ""
  );

const findUncapturedDeckStyles = (dir = DIST_DIR, shellSlugs = premiumDeckSlugList()) =>
  deckDetailFiles(dir, shellSlugs)
    .filter((file) => !hasCapturedStyles(fs.readFileSync(file, "utf8")))
    .map((file) => path.relative(dir, file));

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

const findCanonicalIssues = (dir = DIST_DIR, shellSlugs = premiumDeckSlugList()) =>
  listHtmlFiles(dir)
    .filter((entry) => !SHELL_PAGES.has(entry) && !premiumShellEntries(shellSlugs).has(posixEntry(entry)))
    .flatMap((entry) => {
      const tags = fs.readFileSync(path.join(dir, entry), "utf8").match(CANONICAL_TAG) ?? [];
      if (tags.length !== 1) {
        return [`${entry}: expected 1 canonical, found ${tags.length}`];
      }
      const href = decodeXmlEntities(tags[0].match(/\bhref=["']([^"']*)["']/i)?.[1] ?? "");
      const expected = expectedCanonical(entry);
      return href === expected ? [] : [`${entry}: canonical ${href} is not ${expected}`];
    });

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

const findHubPageIssues = (dir = DIST_DIR, archive = loadArchive(), decks = loadDecks()) => {
  const liveSlugs = new Set(decks.map((deck) => deckSlug(deck.name)));
  const hubs = [...new Set(archive.map((entry) => entry.hub))].filter((hub) => !liveSlugs.has(hub));
  return hubs.flatMap((hub) => {
    const entries = archive.filter((entry) => entry.hub === hub);
    const indexed = shouldIndexHub(entries);
    const name = hubDisplayName(entries);
    return ["", "ja/"].flatMap((prefix) => {
      const entry = `${prefix}deck/${hub}/index.html`;
      const file = path.join(dir, entry);
      if (!fs.existsSync(file)) return [`${entry}: missing`];
      const expectedRobots = prefix === "" && indexed ? "index, follow" : "noindex, follow";
      return hubHtmlIssues(entry, fs.readFileSync(file, "utf8"), expectedRobots, name);
    });
  });
};

const findExpansionPageIssues = (dir = DIST_DIR, expansions = loadExpansions(), decks = loadDecks()) => {
  const policy = expansionIndexPolicy(expansions, decks);
  const issues = [];
  for (const expansion of expansions.filter((entry) => !DELUXE_EXPANSION_IDS.has(entry.id))) {
    for (const prefix of ["", "ja/"]) {
      const entry = `${prefix}expansion-list/${expansion.id}/index.html`;
      const file = path.join(dir, entry);
      if (!fs.existsSync(file)) {
        issues.push(`${entry}: missing`);
        continue;
      }
      const html = fs.readFileSync(file, "utf8");
      const expectedRobots = policy.isIndexable(expansion.id) ? "index, follow" : "noindex, follow";
      issues.push(...hubHtmlIssues(entry, html, expectedRobots, expansionCode(expansion.id)));
      if (!html.includes(`"@type":"BreadcrumbList"`)) issues.push(`${entry}: missing BreadcrumbList JSON-LD`);
    }
  }
  return issues;
};

const HEAD_BLOCK = /<head\b[^>]*>[\s\S]*?<\/head>/i;
const TITLE_TAG = /<title\b[^>]*>[\s\S]*?<\/title>/gi;

const findTitleCountIssues = (dir = DIST_DIR) =>
  listHtmlFiles(dir).flatMap((entry) => {
    const html = fs.readFileSync(path.join(dir, entry), "utf8");
    const count = (html.match(HEAD_BLOCK)?.[0].match(TITLE_TAG) ?? []).length;
    return count === 1 ? [] : [`${entry}: expected 1 title, found ${count}`];
  });

const findShellPageIssues = (dir = DIST_DIR) =>
  [...SHELL_PAGES].flatMap((entry) => {
    const file = path.join(dir, entry);
    if (!fs.existsSync(file)) return [`${entry}: missing`];
    const html = fs.readFileSync(file, "utf8");
    const robots = (html.match(/<meta\b[^>]*>/gi) ?? []).filter((tag) => /\bname=["']robots["']/i.test(tag));
    const issues = [];
    if (!robots.some((tag) => /\bnoindex\b/i.test(tag))) issues.push(`${entry}: no noindex robots meta`);
    if ((html.match(CANONICAL_TAG) ?? []).length > 0) issues.push(`${entry}: has a canonical`);
    return issues;
  });

const readAppRoutePaths = (source) => {
  const tokens = [...source.matchAll(/<Route\b|<\/Route>/g)];
  const stack = [];
  const routes = [];
  tokens.forEach((token, index) => {
    if (token[0] === "</Route>") {
      stack.pop();
      return;
    }
    const end = index + 1 < tokens.length ? tokens[index + 1].index : source.length;
    const segment = source.slice(token.index, end);
    const parent = stack[stack.length - 1] ?? "";
    const own = segment.match(/\spath="([^"]*)"/)?.[1];
    const full =
      own === undefined
        ? parent || "/"
        : own.startsWith("/")
          ? own
          : `${parent.replace(/\/$/, "")}/${own}`;
    if (own !== undefined) routes.push(full);
    if (!/\/>\s*$/.test(segment.trimEnd())) stack.push(full);
  });
  return routes;
};

const findUnresolvedAppRoutes = (
  dir = DIST_DIR,
  {
    source = fs.readFileSync(APP_SOURCE_PATH, "utf8"),
    firebase = JSON.parse(fs.readFileSync(FIREBASE_CONFIG_PATH, "utf8")),
  } = {}
) => {
  const files = new Set(
    fs
      .readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)).split(path.sep).join("/"))
  );
  return readAppRoutePaths(source)
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

const deckDetailFiles = (dir = DIST_DIR, shellSlugs = premiumDeckSlugList()) => {
  if (!fs.existsSync(dir)) return [];
  const shells = premiumShellEntries(shellSlugs);
  return fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name === "index.html")
    .map((entry) => path.join(entry.parentPath, entry.name))
    .filter((file) => {
      const segments = path.relative(dir, file).split(path.sep);
      return segments.length >= 3 && segments[segments.length - 3] === "deck";
    })
    .filter((file) => !shells.has(posixEntry(path.relative(dir, file))))
    .sort();
};

const defaultOtherDeckSlugs = () => {
  const live = loadDecks().map((deck) => deckSlug(deck.name));
  const hubs = loadArchive().map((entry) => entry.hub);
  return new Set([...live, ...hubs]);
};

const findPremiumShellIssues = (
  dir = DIST_DIR,
  { slugs = premiumDeckSlugList(), otherSlugs = defaultOtherDeckSlugs() } = {}
) => {
  const expected = [...premiumShellEntries(slugs)];
  const issues = expected.flatMap((entry) => {
    const file = path.join(dir, entry);
    const local = entry.split("/").join(path.sep);
    if (!fs.existsSync(file)) return [`${local}: missing`];
    const html = fs.readFileSync(file, "utf8");
    const robots = (html.match(/<meta\b[^>]*>/gi) ?? []).filter((tag) => /\bname=["']robots["']/i.test(tag));
    return [
      ...(robots.some((tag) => /\bnoindex\b/i.test(tag)) ? [] : [`${local}: no noindex robots meta`]),
      ...((html.match(CANONICAL_TAG) ?? []).length > 0 ? [`${local}: has a canonical`] : []),
      ...(/<link\b[^>]*\bhreflang=/i.test(html) ? [`${local}: has alternates`] : []),
      ...(EMPTY_ROOT.test(html) ? [] : [`${local}: carries rendered content`]),
    ];
  });
  const allowed = new Set([...expected, ...[...otherSlugs].flatMap((slug) => [`deck/${slug}/index.html`, `ja/deck/${slug}/index.html`])]);
  const extras = deckDetailFiles(dir, [])
    .map((file) => posixEntry(path.relative(dir, file)))
    .filter((entry) => !allowed.has(entry))
    .map((entry) => `${entry.split("/").join(path.sep)}: unexpected deck page`);
  return [...issues, ...extras];
};

const findTemplateModulepreloads = (dir = DIST_DIR) => {
  const detail = deckDetailFiles(dir);
  if (detail.length > 0) {
    return new Set(collectModulepreloads(fs.readFileSync(detail[0], "utf8")));
  }
  const home = path.join(dir, "index.html");
  if (fs.existsSync(home)) {
    return new Set(collectModulepreloads(fs.readFileSync(home, "utf8")));
  }
  return new Set();
};

const sameSet = (a, b) =>
  a.length === b.length && a.every((value, index) => value === b[index]);

const findModulepreloadDrift = (
  dir = DIST_DIR,
  templateHrefs = findTemplateModulepreloads(dir)
) => {
  const expected = [...templateHrefs].sort();
  return listHtmlFiles(dir).flatMap((entry) => {
    const html = fs.readFileSync(path.join(dir, entry), "utf8");
    const actual = [...new Set(collectModulepreloads(html))].sort();
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
const JA_EXPANSION_LIST_ENTRY = "ja/expansion-list/index.html";
const EXPANSIONS_OPTION_LABEL = {
  [EXPANSION_LIST_ENTRY]: require("../src/locales/en_translation.json").expansionList.viewExpansions,
  [JA_EXPANSION_LIST_ENTRY]: require("../src/locales/ja_translation.json").expansionList.viewExpansions,
};

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

const findExpansionListIssues = (dir = DIST_DIR, list = loadExpansions()) => {
  const html = fs.readFileSync(path.join(dir, EXPANSION_LIST_ENTRY), "utf8");
  const sources = imageSrcs(html);
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
  for (const entry of [EXPANSION_LIST_ENTRY, JA_EXPANSION_LIST_ENTRY]) {
    const file = path.join(dir, entry);
    if (!fs.existsSync(file)) {
      issues.push(`${entry}: missing`);
    } else {
      issues.push(...findDefaultViewIssues(entry, fs.readFileSync(file, "utf8")));
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

const findDeckImagePreloadIssues = (
  dir = DIST_DIR,
  hubSlugs = new Set(loadArchive().map((entry) => entry.hub)),
  cardlessSlugs = new Set()
) =>
  deckDetailFiles(dir)
    .filter((file) => !hubSlugs.has(path.basename(path.dirname(file))))
    .flatMap((file) => {
    const entry = path.relative(dir, file);
    const tags = collectImagePreloads(fs.readFileSync(file, "utf8"));
    const expected = cardlessSlugs.has(path.basename(path.dirname(file))) ? 0 : 1;
    if (tags.length !== expected) {
      return [`${entry}: expected ${expected} image preload${expected === 1 ? "" : "s"}, found ${tags.length}`];
    }
    if (expected === 0) return [];
    return imageCandidates(tags[0]).flatMap((candidate) => {
      const url = candidate.split("?")[0];
      if (!url.startsWith("/thumbs/")) return [`${entry}: ${candidate} is outside /thumbs/`];
      return fs.existsSync(path.join(dir, url)) ? [] : [`${entry}: ${url} is not built`];
    });
  });

const findMissingLiveDeckPages = (dir = DIST_DIR, decks = loadDecks()) =>
  decks.flatMap((deck) => {
    const slug = deckSlug(deck.name);
    return ["", "ja/"]
      .map((prefix) => `${prefix}deck/${slug}/index.html`)
      .filter((entry) => !fs.existsSync(path.join(dir, entry)))
      .map((entry) => `${entry}: missing`);
  });

const isExternalHost = (src) => {
  const match = src.match(/^(?:https?:)?\/\/([^/?#]+)/i);
  if (!match) return false;
  const host = match[1].split("@").pop().split(":")[0].toLowerCase();
  return host !== SITE_HOST;
};

const findExternalScripts = (dir = DIST_DIR) =>
  listHtmlFiles(dir).flatMap((entry) => {
    const html = fs.readFileSync(path.join(dir, entry), "utf8");
    return [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']*)["'][^>]*>/gi)]
      .map((match) => match[1])
      .filter(isExternalHost)
      .map((src) => `${entry}: ${src}`);
  });

const findCspHashIssues = (
  dir = DIST_DIR,
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
  return listHtmlFiles(dir).flatMap((entry) =>
    inlineScriptHashes(fs.readFileSync(path.join(dir, entry), "utf8"))
      .filter((hash) => !allowed.has(hash))
      .map((hash) => `${entry}: ${hash} is not in ${directive}`)
  );
};

const findCspBootstrapIssues = (
  dir = DIST_DIR,
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
  if (!fs.existsSync(path.join(dir, "app.js"))) {
    issues.push("app.js: fixed application entry is missing");
  }
  for (const entry of listHtmlFiles(dir)) {
    const html = fs.readFileSync(path.join(dir, entry), "utf8");
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

const main = () => {
  const missingLivePages = findMissingLiveDeckPages();
  if (missingLivePages.length > 0) {
    console.error(`Live decks without a prerendered page:\n${missingLivePages.join("\n")}`);
    process.exit(1);
  }
  const offenders = findLoopbackRefs();
  if (offenders.length > 0) {
    console.error(
      `Loopback origins found in built HTML:\n${offenders.join("\n")}`
    );
    process.exit(1);
  }
  const slashlessInternalLinks = findSlashlessInternalLinks();
  if (slashlessInternalLinks.length > 0) {
    console.error(
      `Internal links without a trailing slash in built HTML:\n${slashlessInternalLinks.join("\n")}`
    );
    process.exit(1);
  }
  const openGraphIssues = findOpenGraphIssues();
  if (openGraphIssues.length > 0) {
    console.error(`Duplicate or non-canonical Open Graph metadata in built HTML:\n${openGraphIssues.join("\n")}`);
    process.exit(1);
  }
  const emptyStyledTags = findEmptyStyledTags();
  if (emptyStyledTags.length > 0) {
    console.error(
      `Empty styled-components CSS found in built HTML:\n${emptyStyledTags.join("\n")}`
    );
    process.exit(1);
  }
  const emptyDeckRoots = findEmptyDeckRoots();
  if (emptyDeckRoots.length > 0) {
    console.error(
      `Empty deck roots found in built HTML:\n${emptyDeckRoots.join("\n")}`
    );
    process.exit(1);
  }
  const uncapturedDeckStyles = findUncapturedDeckStyles();
  if (uncapturedDeckStyles.length > 0) {
    console.error(
      `Deck pages without captured styled-components CSS:\n${uncapturedDeckStyles.join("\n")}`
    );
    process.exit(1);
  }
  const titleIssues = findTitleCountIssues();
  if (titleIssues.length > 0) {
    console.error(`Built pages without exactly one title:\n${titleIssues.join("\n")}`);
    process.exit(1);
  }
  const canonicalIssues = findCanonicalIssues();
  if (canonicalIssues.length > 0) {
    console.error(
      `Pages without exactly one canonical of their own:\n${canonicalIssues.join("\n")}`
    );
    process.exit(1);
  }
  const hubIssues = findHubPageIssues();
  if (hubIssues.length > 0) {
    console.error(`Deck hub pages failing the head or copy checks:\n${hubIssues.join("\n")}`);
    process.exit(1);
  }
  const expansionIssues = findExpansionPageIssues();
  if (expansionIssues.length > 0) {
    console.error(`Expansion pages failing the head or coverage checks:\n${expansionIssues.join("\n")}`);
    process.exit(1);
  }
  const premiumDataFiles = findPremiumDataFiles();
  if (premiumDataFiles.length > 0) {
    console.error(
      `Premium window data shipped in the build output:\n${premiumDataFiles.join("\n")}`
    );
    process.exit(1);
  }
  const premiumShellIssues = findPremiumShellIssues();
  if (premiumShellIssues.length > 0) {
    console.error(
      `Premium deck shells must match the slug list exactly:\n${premiumShellIssues.join("\n")}`
    );
    process.exit(1);
  }
  const shellIssues = findShellPageIssues();
  if (shellIssues.length > 0) {
    console.error(
      `404 and app-shell pages must be noindex without a canonical:\n${shellIssues.join("\n")}`
    );
    process.exit(1);
  }
  const expansionListIssues = findExpansionListIssues();
  if (expansionListIssues.length > 0) {
    console.error(
      `Expansion list missing the newest set or showing a deluxe pack:\n${expansionListIssues.join("\n")}`
    );
    process.exit(1);
  }
  const routeGaps = findUnresolvedAppRoutes();
  if (routeGaps.length > 0) {
    console.error(
      `App routes with no built file, redirect or explicit rewrite:\n${routeGaps.join("\n")}`
    );
    process.exit(1);
  }
  const bakedAppState = findBakedAppState();
  if (bakedAppState.length > 0) {
    console.error(
      `Live app state baked into the <html> tag of built HTML:\n${bakedAppState.join("\n")}`
    );
    process.exit(1);
  }
  const preloadDrift = findModulepreloadDrift();
  if (preloadDrift.length > 0) {
    console.error(
      `Modulepreload sets drifting from the template:\n${preloadDrift.join("\n")}`
    );
    process.exit(1);
  }
  const externalScripts = findExternalScripts();
  if (externalScripts.length > 0) {
    console.error(
      `Script tags pointing at another host in built HTML:\n${externalScripts.join("\n")}`
    );
    process.exit(1);
  }
  const cspHashIssues = findCspHashIssues();
  if (cspHashIssues.length > 0) {
    console.error(
      `Inline scripts missing from the enforced Content-Security-Policy in firebase.json:\n${cspHashIssues.join("\n")}`
    );
    process.exit(1);
  }
  const cspBootstrapIssues = findCspBootstrapIssues();
  if (cspBootstrapIssues.length > 0) {
    console.error(
      `Untrusted or missing application bootstrap in built HTML:\n${cspBootstrapIssues.join("\n")}`
    );
    process.exit(1);
  }
  const imagePreloadIssues = findDeckImagePreloadIssues(undefined, undefined, cardlessDeckSlugs());
  if (imagePreloadIssues.length > 0) {
    console.error(
      `Deck page image preloads without a built file:\n${imagePreloadIssues.join("\n")}`
    );
    process.exit(1);
  }
  try {
    const missingThumbs = findMissingDeckThumbs();
    if (missingThumbs.length > 0) {
      console.error(
        `Deck icon ids without a built thumbnail:\n${missingThumbs.join("\n")}`
      );
      process.exit(1);
    }
    const missingCardThumbs = findMissingCardThumbs();
    if (missingCardThumbs.length > 0) {
      console.error(
        `Deck card ids without a built card thumbnail:\n${missingCardThumbs.join("\n")}`
      );
      process.exit(1);
    }
  } catch (error) {
    console.error(`Deck thumbnail check failed: ${error.message}`);
    process.exit(1);
  }
  console.log(`No loopback origins in ${DIST_DIR}`);
};

if (require.main === module) main();

module.exports = {
  PREMIUM_DATA_FILES,
  findPremiumDataFiles,
  findPremiumShellIssues,
  findBakedAppState,
  findHubPageIssues,
  findExpansionPageIssues,
  findCanonicalIssues,
  findCspHashIssues,
  findCspBootstrapIssues,
  findShellPageIssues,
  findTitleCountIssues,
  findUnresolvedAppRoutes,
  findDeckImagePreloadIssues,
  findEmptyDeckRoots,
  findEmptyStyledTags,
  findExpansionListIssues,
  findExternalScripts,
  findLoopbackRefs,
  findSlashlessInternalLinks,
  findOpenGraphIssues,
  findMissingCardThumbs,
  findMissingLiveDeckPages,
  findMissingDeckThumbs,
  findModulepreloadDrift,
  findUncapturedDeckStyles,
  loadDecks,
  loadExpansions,
  findTemplateModulepreloads,
};
