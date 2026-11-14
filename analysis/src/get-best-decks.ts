import "./load-env-side-effect";
import fs from "node:fs";
import path from "node:path";
import getDecks from "./utils/get-decks";
import { calculateCardScores } from "./utils/calculate-card-scores";
import { buildTrends, pickTrendNames } from "./utils/build-trends";
import { modalCopies, tallyCards } from "./utils/tally-cards";
import {
  buildDeckPopulation,
  buildWindowArtefacts,
  DEFAULT_WINDOW,
  unmatchedDecksIn,
  WINDOW_IDS,
  WindowArtefacts,
  WindowId,
} from "./utils/build-window-artefacts";
import { buildRunFiles } from "./utils/build-run-files";
import { StagedOgImages, stageOgImages } from "./utils/generate-og-images";
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
import cardsJson from "pokemon-tcg-pocket-cards/data/v5/cards.min.json";
import type { PokemonTCGPocketCardsV5CoreSchema } from "pokemon-tcg-pocket-cards/data/v5/cards.core";
import { deckSlug } from "../../src/app/deck-slug";
import { parseDeckListRef } from "../../src/app/card-ref";
import { windowArtefactName } from "../../src/types/meta-windows";
import type { PipelinePartialDeck } from "../../src/types/pipeline-data";

const isPremiumWindow = (window: WindowId): boolean =>
  (PREMIUM_WINDOWS as readonly string[]).includes(window);
const previousCount = (window: WindowId, baselineDir: string | null): number | null => {
  if (!isPremiumWindow(window)) {
    return readPreviousArchetypeCount(
      `../public/data/${windowArtefactName("best-decks", window)}.json`,
      `../public/data/${windowArtefactName("meta-share", window)}.json`,
      EXPANSION_RELEASE_DATE
    );
  }
  if (baselineDir === null) return null;
  return readPreviousArchetypeCount(
    premiumFilePath(windowArtefactName("best-decks", window), baselineDir),
    premiumFilePath(windowArtefactName("meta-share", window), baselineDir),
    EXPANSION_RELEASE_DATE
  );
};
const resolvePremiumBaselineDir = (repoRoot: string): string | null => {
  const mainRef = resolveCanonicalMainRef(repoRoot);
  if (!mainRef) {
    throw new Error(
      "cannot resolve the canonical main remote; confirm a remote points at " +
      "PocketDecks/pokemon-tcg-pocket-tier-list"
    );
  }
  const mainVersionStatus = inspectMainPremiumVersion(repoRoot, mainRef);
  if (mainVersionStatus.status === "unreadable") {
    throw new Error(
      `Could not read the premium version committed on canonical main at ${mainRef} ` +
      `(${mainVersionStatus.reason}); refusing to publish against an unreadable baseline`
    );
  }
  const mainVersion = mainVersionStatus.status === "found" ? mainVersionStatus.version : undefined;
  const mainSnapshot = mainVersion
    ? loadPremiumSnapshotForVersion(mainVersion, PREMIUM_DIR)
    : undefined;
  if (!mainVersion || !mainSnapshot) {
    console.log(
      `No premium baseline for canonical main (${mainVersion ?? "no committed version"}) at ` +
      `${mainRef}; first publish, so their thinner-than-last-time floors are skipped`
    );
    return null;
  }
  return premiumVersionSnapshotDir(mainVersion, PREMIUM_DIR);
};
type CardData = PokemonTCGPocketCardsV5CoreSchema[number];
const cards: PokemonTCGPocketCardsV5CoreSchema = cardsJson;
const listingStore = listings as DeckListingStore;
const newestSet = STANDARD_SET_CODES[STANDARD_SET_CODES.length - 1];

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

const cardsById: ReadonlyMap<string, CardData> = new Map(cards.map((card) => [card.id, card]));

const assertCardsKnown = (bestDecks: PipelinePartialDeck[]): void => {
  for (const deck of bestDecks) {
    for (const list of deck.lists) {
      for (const ref of list.cards) {
        const { id } = parseDeckListRef(ref);
        if (!cardsById.has(id)) {
          throw new Error(`Card not found in API: ${id}`);
        }
      }
    }
  }
};

const ogDeckInput = (name: string) => {
  const icons = deckNameToIconIds(name)
    .map((id) => cardsById.get(id))
    .filter((card): card is CardData => card !== undefined)
    .sort((a, b) => Number(!!b.ex) - Number(!!a.ex));
  return {
    slug: deckSlug(name),
    name: icons.map((card) => card.name).join(" & "),
    iconUrls: icons.map((card) => card.image).filter((url): url is string => !!url),
  };
};

// Decks that matched no listing are not archetypes, so they leave the
// published ranking. Their count and games are logged and gated: a rise in
// the bucket means the pairing store missed something.
const reportUnmatched = (defaultQualified: Deck[]) => {
  const unmatched = unmatchedDecksIn(defaultQualified);
  const qualifiedGames = defaultQualified.reduce((sum, deck) => sum + deck.totalGames, 0);
  console.log(
    `Unmatched decks in ${DEFAULT_WINDOW}: ${unmatched.decks} ` +
      `(${unmatched.games} of ${qualifiedGames} qualified games)`
  );
  return { decks: unmatched.decks, games: unmatched.games, qualifiedGames };
};

const commitOgImages = (staged: StagedOgImages): void => {
  try {
    staged.commit({ retainOnFailure: true });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const location = staged.staging
      ? ` The rendered set is kept at ${staged.staging}; the previous set is ${staged.backup}.`
      : "";
    throw new Error(`The JSON artefacts are published but the OG images are not: ${reason}.${location} Finish the image swap by hand before rerunning; step 1 will stop on the retained staging directory until then.`);
  }
};

interface PublishInput {
  artefacts: Record<WindowId, WindowArtefacts>;
  files: Omit<Parameters<typeof buildRunFiles>[0], "premiumDir" | "artefacts">;
  deckNames: string[];
  newestQualifiedDate: string | null;
  latestDataDate: string | null;
  unmatchedDecks: { decks: number; games: number; qualifiedGames: number };
  staged: StagedOgImages;
}

const checkPublishable = (input: PublishInput, premiumBaselineDir: string | null): void => {
  const windowSnapshots = WINDOW_IDS.map((window) => ({
    id: window,
    bestDecks: input.artefacts[window].bestDecks,
    previousArchetypeCount: previousCount(window, premiumBaselineDir),
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
    deckSlugs: input.deckNames.map(deckSlug),
    newestDeckDate: input.newestQualifiedDate,
    daysOfData: daysOfDataSince(input.latestDataDate, EXPANSION_RELEASE_DATE),
    now: input.files.today,
    currentSet: listingStore.currentSet,
    newestSet,
    currentSetListingCount: listingStore.sets[newestSet]?.decks.length ?? 0,
    unmatchedDecks: input.unmatchedDecks,
  });
};

const publish = (input: PublishInput): void => {
  let jsonPublished = false;
  try {
    withStoreLock(decksDir(), () => {
      checkPublishable(input, resolvePremiumBaselineDir(path.resolve(__dirname, "../..")));
      fs.mkdirSync(PREMIUM_DIR, { recursive: true });
      writeArtefacts(
        buildRunFiles({ ...input.files, artefacts: input.artefacts, premiumDir: PREMIUM_DIR })
      );
      jsonPublished = true;
      commitOgImages(input.staged);
    });
  } catch (error) {
    if (!jsonPublished) input.staged.discard();
    throw error;
  }
};

export const run = async (): Promise<void> => {
  const allDecks = withStoreLock(decksDir(), () => getDecks());
  const today = new Date();
  const population = buildDeckPopulation(allDecks, today);

  const artefacts = Object.fromEntries(
    WINDOW_IDS.map((window) => [window, buildWindowArtefacts(population, window)])
  ) as Record<WindowId, WindowArtefacts>;
  for (const window of WINDOW_IDS) {
    console.log(
      `Window ${window}: ${artefacts[window].bestDecks.length} ranked archetypes`
    );
  }

  const unmatchedDecks = reportUnmatched(population.windows[DEFAULT_WINDOW].qualified);

  // Trends and card scores stay un-windowed, so they read the whole store
  // through the all-time window and the published page keeps the same
  // history and card table as before the selector landed.
  const allQualified = population.windows.all.qualified;
  const trends = buildTrends(allQualified, pickTrendNames(artefacts.all.bestDecks));
  const cardScoresList = buildCardScores(allQualified, scoringWeights(population.anchor));

  assertCardsKnown(artefacts[DEFAULT_WINDOW].bestDecks);

  // OG images cover every deck visible in any window, so switching views
  // never lands on a missing image.
  const deckNames = [
    ...new Set(
      WINDOW_IDS.flatMap((window) => artefacts[window].bestDecks.map((deck) => deck.name))
    ),
  ];
  const staged = await stageOgImages(deckNames.map(ogDeckInput));

  publish({
    artefacts,
    files: { trends, cardScoresList, today },
    deckNames,
    newestQualifiedDate: newestDeckDate(allQualified),
    latestDataDate: newestDeckDate(allDecks),
    unmatchedDecks,
    staged,
  });
};

if (require.main === module) {
  run().catch((error) => {
    console.error("Pipeline failed:", error);
    process.exit(1);
  });
}
