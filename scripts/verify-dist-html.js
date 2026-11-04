const fs = require("fs");
const path = require("path");
const { deckNameToIconIds } = require("./deck-name.mjs");
const { deckSlug } = require("./deck-slug.mjs");
const {
  CARD_THUMB_WIDTHS,
  DECK_THUMB_SIZES,
  DECK_THUMB_VERSION,
  deckListCardIds,
  firstBestListCardId,
} = require("./deck-thumbs.mjs");
const { resolveHosting } = require("./firebase-hosting");
const { inlineScriptHashes, parsePolicy, reportOnlyPolicy } = require("./content-security-policy");
const { DELUXE_EXPANSION_IDS, newestExpansion } = require("../src/app/expansion-policy.mjs");
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

const findEmptyDeckRoots = (dir = DIST_DIR) =>
  deckDetailFiles(dir)
    .filter((file) => EMPTY_ROOT.test(fs.readFileSync(file, "utf8")))
    .map((file) => path.relative(dir, file));

const hasCapturedStyles = (html) =>
  [...html.matchAll(/<style\b[^>]*data-styled[^>]*>([\s\S]*?)<\/style>/gi)].some(
    (match) => match[1].trim() !== ""
  );

const findUncapturedDeckStyles = (dir = DIST_DIR) =>
  deckDetailFiles(dir)
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

const findCanonicalIssues = (dir = DIST_DIR) =>
  listHtmlFiles(dir)
    .filter((entry) => !SHELL_PAGES.has(entry))
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

const findHubPageIssues = (dir = DIST_DIR, archive = loadArchive()) => {
  const hubs = [...new Set(archive.map((entry) => entry.hub))];
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
      if (resolved.kind === "rewrite" && !files.has(resolved.file)) {
        return [`${route}: rewrite target ${resolved.file} is not built`];
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

const deckDetailFiles = (dir = DIST_DIR) => {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name === "index.html")
    .map((entry) => path.join(entry.parentPath, entry.name))
    .filter((file) => {
      const segments = path.relative(dir, file).split(path.sep);
      return segments.length >= 3 && segments[segments.length - 3] === "deck";
    })
    .sort();
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

const imageSrcs = (html) =>
  [...html.matchAll(/<img\b[^>]*\ssrc=["']([^"']*)["']/gi)].map((match) => match[1]);

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
  const policy = reportOnlyPolicy(firebase);
  if (policy === undefined) {
    return ["firebase.json: no Content-Security-Policy-Report-Only header on **"];
  }
  const allowed = new Set(parsePolicy(policy).get("script-src") ?? []);
  return listHtmlFiles(dir).flatMap((entry) =>
    inlineScriptHashes(fs.readFileSync(path.join(dir, entry), "utf8"))
      .filter((hash) => !allowed.has(hash))
      .map((hash) => `${entry}: ${hash} is not in script-src`)
  );
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
      `Inline scripts missing from the Report-Only CSP in firebase.json:\n${cspHashIssues.join("\n")}`
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
  findBakedAppState,
  findHubPageIssues,
  findCanonicalIssues,
  findCspHashIssues,
  findShellPageIssues,
  findTitleCountIssues,
  findUnresolvedAppRoutes,
  findDeckImagePreloadIssues,
  findEmptyDeckRoots,
  findEmptyStyledTags,
  findExpansionListIssues,
  findExternalScripts,
  findLoopbackRefs,
  findMissingCardThumbs,
  findMissingLiveDeckPages,
  findMissingDeckThumbs,
  findModulepreloadDrift,
  findUncapturedDeckStyles,
  loadDecks,
  loadExpansions,
  findTemplateModulepreloads,
};
