const { cspBootstrapIssues, cspHashIssues, externalScripts } = require("./verify-dist-html/csp");
const { bakedAppState, emptyDeckRoots, emptyStyledTags, uncapturedDeckStyles } = require("./verify-dist-html/decks");
const { expansionListIssues, expansionPageIssues, loadExpansions } = require("./verify-dist-html/expansions");
const { hubPageIssues } = require("./verify-dist-html/hubs");
const { loopbackRefs, slashlessInternalLinks } = require("./verify-dist-html/links");
const { canonicalIssues, openGraphIssues, shellPageIssues, titleCountIssues } = require("./verify-dist-html/meta");
const { modulepreloadDrift, templateModulepreloads } = require("./verify-dist-html/modulepreloads");
const { PREMIUM_DATA_FILES, premiumDataFiles, premiumShellIssues } = require("./verify-dist-html/premium");
const { appRoutePaths, unresolvedAppRoutes } = require("./verify-dist-html/routes");
const { DIST_DIR, cardlessDeckSlugs, forDir, loadDecks, openDist } = require("./verify-dist-html/shared");
const { deckImagePreloadIssues, findMissingCardThumbs, findMissingDeckThumbs, findMissingLiveDeckPages } = require("./verify-dist-html/thumbs");

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
