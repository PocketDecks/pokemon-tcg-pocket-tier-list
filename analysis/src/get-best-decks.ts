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
import { generateOgImages } from "./utils/generate-og-images";
import { scoringWeights, ScoringWeights } from "./settings";
import { Deck } from "./utils/types";
import { writeArtefacts } from "./utils/write-artifacts";
import { deckNameToIconIds } from "../../src/types/deck-name";
import cards from "pokemon-tcg-pocket-cards/data/v5/cards.min.json";

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

const run = async () => {
  try {
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
    try {
      await generateOgImages(
        [...ogSlugs].map((name) => {
          const icons = iconCards(name);
          return {
            slug: name.toLowerCase().replace(/\s/g, "-"),
            name: icons.map((card: any) => card.name).join(" & "),
            iconUrls: icons
              .map((card: any) => card.image)
              .filter((url: string | undefined): url is string => !!url),
          };
        })
      );
    } catch (error) {
      console.error("OG image generation failed; continuing without images:", error);
    }

    writeArtefacts({
      ...buildArtefactFiles(artefacts),
      "../public/data/historical-trends.json": JSON.stringify(trends, null, 2),
      "../public/data/card-scores.json": JSON.stringify(cardScoresList, null, 2),
      "../src/app/last-updated.ts": `export const LAST_UPDATED = new Date("${new Date().toISOString()}");`,
    });
  } catch (error) {
    console.error("Pipeline failed:", error);
    process.exit(1);
  }
};

run();
