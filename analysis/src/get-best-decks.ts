import fs from "fs";
import cardToString from "./utils/card-to-string";
import getDecks from "./utils/get-decks";
import getId from "./utils/get-id";
import { calculateDeckScore } from "./utils/calculate-deck-score";
import { calculateCardScores } from "./utils/calculate-card-scores";
import { calculateMatchupResults } from "./utils/calculate-matchup-results";
import { buildTrends } from "./utils/build-trends";
import { buildMatchupData } from "./utils/build-matchup-data";
import { buildMetaShare } from "./utils/build-meta-share";
import { generateOgImages } from "./utils/generate-og-images";
import { Deck, DeckList, PartialDeck } from "./utils/types";
import { convertCardsToIds } from "./utils/convert-cards";
import {
  MIN_WINRATE_THRESHOLD,
  MIN_ARCHETYPE_QUALIFIED_GAMES,
} from "./settings";
import cards from "pokemon-tcg-pocket-cards/data/v5/cards.min.json";

const run = async () => {
  try {
    const allDecks = getDecks();

    const qualifiedDecks = allDecks.filter(
      (deck: Deck) =>
        deck.totalGames > 0 &&
        deck.winCount / deck.totalGames >= MIN_WINRATE_THRESHOLD
    );

    console.log(
      `Qualified decks (>=${MIN_WINRATE_THRESHOLD * 100}% winrate): ${qualifiedDecks.length} / ${allDecks.length}`
    );

    const allQualifiedGames = qualifiedDecks.reduce(
      (acc: number, deck: Deck) => acc + deck.totalGames,
      0
    );

    // Tally qualified games per archetype so we can drop tiny-sample
    // archetypes (1-2 lucky tournament runs) from the rankings.
    const qualifiedGamesByName = new Map<string, number>();
    for (const deck of qualifiedDecks) {
      qualifiedGamesByName.set(
        deck.name,
        (qualifiedGamesByName.get(deck.name) ?? 0) + deck.totalGames
      );
    }

    const allDeckNames = [...new Set(qualifiedDecks.map((d: Deck) => d.name))];
    const uniqueDeckNames = allDeckNames.filter(
      (name: string) =>
        (qualifiedGamesByName.get(name) ?? 0) >= MIN_ARCHETYPE_QUALIFIED_GAMES
    );
    const droppedCount = allDeckNames.length - uniqueDeckNames.length;
    console.log(
      `Archetypes ranked: ${uniqueDeckNames.length} (dropped ${droppedCount} below ${MIN_ARCHETYPE_QUALIFIED_GAMES} qualified games)`
    );

    // Calculate Best Decks
    const bestDecks: PartialDeck[] = [];
    const idExists: Record<string, boolean> = {};
    let matchupResults: Record<
      string,
      Record<string, { wins: number; losses: number }>
    > = {};

    for (const deckName of uniqueDeckNames) {
      matchupResults[deckName] = {};

      // Qualified decks for this archetype (80%+ winrate)
      const matchingQualifiedDecks = qualifiedDecks.filter(
        (game: Deck) => game.name === deckName
      );
      const matchingQualifiedGames = matchingQualifiedDecks.reduce(
        (acc: number, game: Deck) => acc + game.totalGames,
        0
      );
      const percentOfGames = matchingQualifiedGames / allQualifiedGames;

      const cards: Record<
        string,
        { winCount: number; totalGames: number; score?: number }
      > = {};
      for (const deck of matchingQualifiedDecks) {
        for (const card of deck.cards) {
          const cardName = cardToString(card);
          if (cards[cardName]) {
            cards[cardName].winCount += deck.winCount;
            cards[cardName].totalGames += deck.totalGames;
          } else {
            cards[cardName] = {
              winCount: deck.winCount,
              totalGames: deck.totalGames,
            };
          }
        }
      }

      // Calculate card scores from qualified decks
      const scoredCards = calculateCardScores(cards, matchingQualifiedGames);

      // Calculate matchup results from ALL decks (unfiltered) so winrates are accurate
      matchupResults[deckName] = calculateMatchupResults(allDecks, deckName);

      // Build lists from qualified decks only
      const lists: DeckList[] = [];
      for (const deck of matchingQualifiedDecks) {
        const id = getId(deck);
        if (idExists[id]) continue;
        const deckScore = calculateDeckScore(
          deck,
          scoredCards,
          matchingQualifiedGames,
          allQualifiedGames
        );
        const formattedList: DeckList = {
          cards: convertCardsToIds(deck.cards),
          score: deckScore.score,
          strength: deckScore.strength,
        };
        lists.push(formattedList);
        idExists[id] = true;
      }

      const deckScore = calculateDeckScore(
        matchingQualifiedDecks[0],
        scoredCards,
        matchingQualifiedGames,
        allQualifiedGames
      );
      bestDecks.push({
        name: deckName,
        lists,
        popularity: deckScore.popularity,
        percentOfGames,
        score: lists.length ? Math.max(...lists.map((l) => l.score)) : 0
      });
    }

    // Sort bestDecks by score descending to ensure deterministic ordering
    bestDecks.sort((a, b) => b.score - a.score);

    const matchupData = buildMatchupData(matchupResults);

    const allCards: Record<string, { winCount: number; totalGames: number }> = {};
    for (const deck of qualifiedDecks) {
      for (const card of deck.cards) {
        const cardName = cardToString(card);
        if (allCards[cardName]) {
          allCards[cardName].winCount += deck.winCount;
          allCards[cardName].totalGames += deck.totalGames;
        } else {
          allCards[cardName] = {
            winCount: deck.winCount,
            totalGames: deck.totalGames,
          };
        }
      }
    }
    const cardScores = calculateCardScores(allCards, allQualifiedGames);
    const cardScoresList: { name: string; score: number; popularity: number }[] =
      Object.entries(cardScores).map(([cardName, { score, popularity }]) => ({
        name: cardName,
        score,
        popularity,
      }));
    cardScoresList.sort((a, b) => b.score - a.score);

    const cardIds = cards.map((card: any) => card.id);
    const idExistsInApi: Record<string, boolean> = cardIds.reduce(
      (acc: Record<string, boolean>, id: string) => {
        acc[id] = true;
        return acc;
      },
      {}
    ) as Record<string, boolean>;

    for (const deck of bestDecks) {
      for (const list of deck.lists) {
        for (const card of list.cards) {
          const parts = card.split(":");
          const id = parts[1];
          if (!idExistsInApi[id]) {
            throw new Error(`Card not found in API: ${id}`);
          }
        }
      }
    }

    const deckIconIds = (name: string): string[] =>
      name.split("&").map((part: string) => {
        const segments = part.split("-");
        return [segments[segments.length - 2], segments[segments.length - 1]].join(
          "-"
        );
      });

    const cardsById = new Map(cards.map((card: any) => [card.id, card] as [string, any]));

    const iconCards = (name: string) =>
      deckIconIds(name)
        .map((id: string) => cardsById.get(id))
        .filter((card: any): card is any => !!card)
        .sort((a: any, b: any) => Number(!!b.ex) - Number(!!a.ex));

    try {
      await generateOgImages(
        bestDecks.map((deck) => {
          const icons = iconCards(deck.name);
          return {
            slug: deck.name.toLowerCase().replace(/\s/g, "-"),
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

    const trends = buildTrends(qualifiedDecks, bestDecks);

    fs.writeFileSync(
        "../public/data/historical-trends.json",
        JSON.stringify(trends, null, 2)
    );

    const metaShare = buildMetaShare(qualifiedDecks, bestDecks, new Date());
    fs.writeFileSync(
        "../public/data/meta-share.json",
        JSON.stringify(metaShare, null, 2)
    );

    fs.writeFileSync(
      "./data/card-scores.json",
      JSON.stringify(cardScoresList, null, 2)
    );
    fs.writeFileSync(
      "../public/data/card-scores.json",
      JSON.stringify(cardScoresList, null, 2)
    );
    fs.writeFileSync(
      "./data/best-decks.json",
      JSON.stringify(bestDecks, null, 2)
    );
    fs.writeFileSync(
      "../public/data/best-decks.json",
      JSON.stringify(bestDecks, null, 2)
    );
    fs.writeFileSync(
      "../public/data/matchup-data.json",
      JSON.stringify(matchupData, null, 2)
    );
    fs.writeFileSync(
      "../src/app/last-updated.ts",
      `export const LAST_UPDATED = new Date("${new Date().toISOString()}");`
    );
  } catch (error) {
    console.error("Pipeline failed:", error);
    process.exit(1);
  }
};

run();