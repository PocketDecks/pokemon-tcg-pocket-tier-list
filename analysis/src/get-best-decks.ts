import "./load-env-side-effect";
import fs from "node:fs";
import path from "node:path";
import getDecks from "./utils/get-decks";
import { calculateCardScores } from "./utils/calculate-card-scores";
import { buildTrends, pickTrendNames } from "./utils/build-trends";
import { modalCopies, tallyCards } from "./utils/tally-cards";
import {
  buildWindowArtefacts,
  DEFAULT_WINDOW,
  latestAnchor,
  qualifiedDecksInWindow,
  unmatchedDecksInWindow,
  WINDOW_IDS,
  WindowArtefacts,
  WindowId,
} from "./utils/build-window-artefacts";
import { buildRunFiles } from "./utils/build-run-files";
import { stageOgImages } from "./utils/generate-og-images";
import { assertPublishable, daysOfDataSince, newestDeckDate, readPreviousArchetypeCount, windowsWithoutComparison } from "./utils/assert-publishable";
import { DeckListingStore } from "./utils/deck-listing-store";
import { STANDARD_SET_CODES } from "./utils/set-codes";
import listings from "./data/limitless-decks.json";
import { EXPANSION_RELEASE_DATE, scoringWeights, ScoringWeights } from "./settings";
import { Deck } from "./utils/types";
import {
  loadPremiumSnapshotForVersion,
  PREMIUM_DIR,
  PREMIUM_WINDOWS,
  premiumFilePath,
  premiumVersionSnapshotDir,
} from "./utils/premium-artefacts";
import {
  inspectMainPremiumVersion,
  resolveCanonicalMainRef,
} from "./utils/premium-files";
import { writeArtefacts } from "./utils/write-artifacts";
import { decksDir } from "./utils/data-paths";
import { withStoreLock } from "./utils/store-lock";
import { deckNameToIconIds } from "../../src/types/deck-name";
import cards from "pokemon-tcg-pocket-cards/data/v5/cards.min.json";

const isPremiumWindow = (window: WindowId): boolean =>
  (PREMIUM_WINDOWS as readonly string[]).includes(window);
const previousArtefact = (base: string, window: WindowId, premiumDir: string | null): string =>
  isPremiumWindow(window)
    ? premiumDir === null
      ? ""
      : premiumFilePath(`${base}-${window}`, premiumDir)
    : `../public/data/${base}-${window}.json`;
const previousBestDecks = (window: WindowId, premiumDir: string | null): string =>
  previousArtefact("best-decks", window, premiumDir);
const previousMetaShare = (window: WindowId, premiumDir: string | null): string =>
  previousArtefact("meta-share", window, premiumDir);
const listingStore = listings as DeckListingStore;
const newestSet = STANDARD_SET_CODES[STANDARD_SET_CODES.length - 1];
const slugOf = (name: string): string => name.toLowerCase().replace(/\s/g, "-");

const buildCardScores = (qualifiedDecks: Deck[], weights: ScoringWeights) => {
  const totalQualifiedGames = qualifiedDecks.reduce(
    (sum, deck) => sum + deck.totalGames,
    0
  );
  const tallies = tallyCards(qualifiedDecks);
  return Object.entries(calculateCardScores(tallies, totalQualifiedGames, weights))
    .map(([identity, { score, popularity }]) => ({
      name: `${modalCopies(tallies[identity])} ${identity}`,
      score,
      popularity,
    }))
    .sort((a, b) => b.score - a.score);
};

export const run = async (): Promise<void> => {
  const allDecks = withStoreLock(decksDir(), () => getDecks());
  const today = new Date();
  const dataAnchor = latestAnchor(allDecks, today);

  const artefacts = Object.fromEntries(
    WINDOW_IDS.map((window) => [window, buildWindowArtefacts(allDecks, window, today)])
  ) as Record<WindowId, WindowArtefacts>;

  for (const window of WINDOW_IDS) {
    console.log(
      `Window ${window}: ${artefacts[window].bestDecks.length} ranked archetypes`
    );
  }

  // Decks that matched no listing are not archetypes, so they leave the
  // published ranking. Their count and games are logged and gated: a rise in
  // the bucket means the pairing store missed something.
  const unmatched = unmatchedDecksInWindow(allDecks, DEFAULT_WINDOW, today);
  const defaultQualifiedGames = qualifiedDecksInWindow(
    allDecks,
    DEFAULT_WINDOW,
    today
  ).reduce((sum, deck) => sum + deck.totalGames, 0);
  console.log(
    `Unmatched decks in ${DEFAULT_WINDOW}: ${unmatched.decks} ` +
      `(${unmatched.games} of ${defaultQualifiedGames} qualified games)`
  );

  // Trends and card scores stay un-windowed, so they read the whole store
  // through the all-time window and the published page keeps the same
  // history and card table as before the selector landed.
  const allQualified = qualifiedDecksInWindow(allDecks, "all", today);
  const latestDataDate = newestDeckDate(allDecks);
  const newestQualifiedDate = newestDeckDate(allQualified);
  const trends = buildTrends(allQualified, pickTrendNames(artefacts.all.bestDecks));
  const cardScoresList = buildCardScores(allQualified, scoringWeights(dataAnchor));

  const cardsById = new Map(cards.map((card: any) => [card.id, card] as [string, any]));
  for (const deck of artefacts[DEFAULT_WINDOW].bestDecks) {
    for (const list of deck.lists) {
      for (const card of list.cards) {
        const id = card.split(":")[1];
        if (!cardsById.has(id)) {
          throw new Error(`Card not found in API: ${id}`);
        }
      }
    }
  }

  const iconCards = (name: string) =>
    deckNameToIconIds(name)
      .map((id: string) => cardsById.get(id))
      .filter((card: any): card is any => !!card)
      .sort((a: any, b: any) => Number(!!b.ex) - Number(!!a.ex));

  // OG images cover every deck visible in any window, so switching views
  // never lands on a missing image.
  const ogSlugs = new Set(
    WINDOW_IDS.flatMap((window) => artefacts[window].bestDecks.map((deck) => deck.name))
  );
  const staged = await stageOgImages(
    [...ogSlugs].map((name) => {
      const icons = iconCards(name);
      return {
        slug: slugOf(name),
        name: icons.map((card: any) => card.name).join(" & "),
        iconUrls: icons
          .map((card: any) => card.image)
          .filter((url: string | undefined): url is string => !!url),
      };
    })
  );

  let imagesCommitted = false;
  let jsonPublished = false;
  try {
    withStoreLock(decksDir(), () => {
      const repoRoot = path.resolve(__dirname, "../..");
      const mainRef = resolveCanonicalMainRef(repoRoot);
      if (!mainRef) {
        throw new Error(
          "cannot resolve the canonical main remote; confirm a remote points at " +
          "PocketDecks/pokemon-tcg-pocket-tier-list"
        );
      }
      const mainVersionStatus = inspectMainPremiumVersion(repoRoot, mainRef);
      const mainVersion = mainVersionStatus.status === "found" ? mainVersionStatus.version : undefined;
      const mainSnapshot = mainVersion
        ? loadPremiumSnapshotForVersion(mainVersion, PREMIUM_DIR)
        : undefined;
      const premiumBaselineDir = mainVersion && mainSnapshot
        ? premiumVersionSnapshotDir(mainVersion, PREMIUM_DIR)
        : null;
      if (mainVersionStatus.status === "unreadable") {
        console.warn(
          `Could not read the premium version committed on canonical main at ${mainRef} ` +
          `(${mainVersionStatus.reason}); treated as a first publish, so the ` +
          `thinner-than-last-time floors for 30d and all are skipped`
        );
      } else if (!mainSnapshot) {
        console.log(
          `No premium baseline for canonical main (${mainVersion ?? "no committed version"}) at ` +
          `${mainRef}; first publish, so their thinner-than-last-time floors are skipped`
        );
      }
      const windowSnapshots = WINDOW_IDS.map((window) => ({
        id: window,
        bestDecks: artefacts[window].bestDecks,
        previousArchetypeCount: isPremiumWindow(window) && premiumBaselineDir === null
          ? null
          : readPreviousArchetypeCount(
              previousBestDecks(window, premiumBaselineDir),
              previousMetaShare(window, premiumBaselineDir),
              EXPANSION_RELEASE_DATE
            ),
      }));
      const uncompared = windowsWithoutComparison(windowSnapshots);
      if (uncompared.length > 0) {
        console.log(
          `No previous publish for ${uncompared.join(", ")}, so their thinner-than-last-time floors were skipped`
        );
      }
      assertPublishable({
        windows: windowSnapshots,
        defaultWindow: DEFAULT_WINDOW,
        deckSlugs: [...ogSlugs].map(slugOf),
        newestDeckDate: newestQualifiedDate,
        daysOfData: daysOfDataSince(latestDataDate, EXPANSION_RELEASE_DATE),
        now: today,
        currentSet: listingStore.currentSet,
        newestSet,
        currentSetListingCount: listingStore.sets[newestSet]?.decks.length ?? 0,
        unmatchedDecks: {
          decks: unmatched.decks,
          games: unmatched.games,
          qualifiedGames: defaultQualifiedGames,
        },
      });

      fs.mkdirSync(PREMIUM_DIR, { recursive: true });

      const files = buildRunFiles({
        artefacts,
        trends,
        cardScoresList,
        today,
        premiumDir: PREMIUM_DIR,
      });
      writeArtefacts(files);
      jsonPublished = true;
      try {
        staged.commit({ retainOnFailure: true });
        imagesCommitted = true;
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        const location = staged.staging
          ? ` The rendered set is kept at ${staged.staging}; the previous set is ${staged.backup}.`
          : "";
        throw new Error(`The JSON artefacts are published but the OG images are not: ${reason}.${location} Finish the image swap by hand before rerunning; step 1 will stop on the retained staging directory until then.`);
      }
    });
  } catch (error) {
    if (!jsonPublished && !imagesCommitted) staged.discard();
    throw error;
  }
};

if (require.main === module) {
  run().catch((error) => {
    console.error("Pipeline failed:", error);
    process.exit(1);
  });
}
