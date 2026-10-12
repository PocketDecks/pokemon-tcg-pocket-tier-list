import "./load-env-side-effect";
import getDecks from "./utils/get-decks";
import { calculateCardScores } from "./utils/calculate-card-scores";
import { buildTrends, pickTrendNames } from "./utils/build-trends";
import { modalCopies, tallyCards } from "./utils/tally-cards";
import {
  buildArtefactFiles,
  buildWindowArtefacts,
  DEFAULT_WINDOW,
  qualifiedDecksInWindow,
  WINDOW_IDS,
  WindowArtefacts,
  WindowId,
} from "./utils/build-window-artefacts";
import { stageOgImages } from "./utils/generate-og-images";
import { isUnmatchedDeck } from "./utils/get-deck-name";
import { unmatchedDecksInWindow } from "./utils/build-window-artefacts";
import { assertPublishable, newestDeckDate, readArchetypeCount } from "./utils/assert-publishable";
import { DeckListingStore } from "./utils/deck-listing-store";
import { STANDARD_SET_CODES } from "./utils/set-codes";
import listings from "./data/limitless-decks.json";
import { scoringWeights, ScoringWeights } from "./settings";
import { Deck } from "./utils/types";
import { writeArtefacts } from "./utils/write-artifacts";
import { deckNameToIconIds } from "../../src/types/deck-name";
import cards from "pokemon-tcg-pocket-cards/data/v5/cards.min.json";

const previousBestDecks = (window: WindowId): string =>
  `../public/data/best-decks-${window}.json`;
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
  const allDecks = getDecks();
  const today = new Date();

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
  const trends = buildTrends(allQualified, pickTrendNames(artefacts.all.bestDecks), today);
  const cardScoresList = buildCardScores(allQualified, scoringWeights(today));

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

  try {
    assertPublishable({
      windows: WINDOW_IDS.map((window) => ({
        id: window,
        bestDecks: artefacts[window].bestDecks,
        previousArchetypeCount: readArchetypeCount(previousBestDecks(window)),
      })),
      defaultWindow: DEFAULT_WINDOW,
      deckSlugs: [...ogSlugs].map(slugOf),
      newestDeckDate: newestDeckDate(allQualified),
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

    writeArtefacts({
      ...buildArtefactFiles(artefacts),
      "../public/data/historical-trends.json": JSON.stringify(trends, null, 2),
      "../public/data/card-scores.json": JSON.stringify(cardScoresList, null, 2),
      "../src/app/last-updated.ts": `export const LAST_UPDATED = new Date("${today.toISOString()}");`,
    });
  } catch (error) {
    staged.discard();
    throw error;
  }
  try {
    staged.commit();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`The JSON artefacts are published but the OG images are not: ${reason}`);
  }
};

if (require.main === module) {
  run().catch((error) => {
    console.error("Pipeline failed:", error);
    process.exit(1);
  });
}
