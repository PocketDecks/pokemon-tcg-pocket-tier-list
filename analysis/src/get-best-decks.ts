import "./load-env-side-effect";
import cardToString from "./utils/card-to-string";
import getDecks from "./utils/get-decks";
import { calculateCardScores } from "./utils/calculate-card-scores";
import { buildTrends } from "./utils/build-trends";
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
import { Deck } from "./utils/types";
import { writeArtefacts } from "./utils/write-artifacts";
import { deckNameToIconIds } from "../../src/types/deck-name";
import cards from "pokemon-tcg-pocket-cards/data/v5/cards.min.json";

const buildCardScores = (qualifiedDecks: Deck[]) => {
  const totalQualifiedGames = qualifiedDecks.reduce(
    (sum, deck) => sum + deck.totalGames,
    0
  );
  const allCards: Record<string, { winCount: number; totalGames: number }> = {};
  for (const deck of qualifiedDecks) {
    for (const card of deck.cards) {
      const cardName = cardToString(card);
      const entry = allCards[cardName] ?? { winCount: 0, totalGames: 0 };
      entry.winCount += deck.winCount;
      entry.totalGames += deck.totalGames;
      allCards[cardName] = entry;
    }
  }

  return Object.entries(calculateCardScores(allCards, totalQualifiedGames))
    .map(([name, { score, popularity }]) => ({ name, score, popularity }))
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
    const trends = buildTrends(allQualified, artefacts.all.bestDecks);
    const cardScoresList = buildCardScores(allQualified);

    const cardIds = new Set(cards.map((card: any) => card.id));
    for (const deck of artefacts[DEFAULT_WINDOW].bestDecks) {
      for (const list of deck.lists) {
        for (const card of list.cards) {
          const id = card.split(":")[1];
          if (!cardIds.has(id)) {
            throw new Error(`Card not found in API: ${id}`);
          }
        }
      }
    }

    const cardsById = new Map(cards.map((card: any) => [card.id, card] as [string, any]));

    const iconCards = (name: string) =>
      deckNameToIconIds(name)
        .map((id: string) => cardsById.get(id))
        .filter((card: any): card is any => !!card)
        .sort((a: any, b: any) => Number(!!b.ex) - Number(!!a.ex));

    // One OG image per archetype that ranks in ANY window, so switching views
    // never lands on a missing image. Orphaned images are pruned below.
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
      "./data/card-scores.json": JSON.stringify(cardScoresList, null, 2),
      "../public/data/card-scores.json": JSON.stringify(cardScoresList, null, 2),
      "./data/best-decks.json": JSON.stringify(
        artefacts[DEFAULT_WINDOW].bestDecks,
        null,
        2
      ),
      "../src/app/last-updated.ts": `export const LAST_UPDATED = new Date("${new Date().toISOString()}");`,
    });
  } catch (error) {
    console.error("Pipeline failed:", error);
    process.exit(1);
  }
};

run();
