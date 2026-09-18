import { calculateDeckScore } from "../utils/calculate-deck-score";
import {
  CARDS_IN_DECK,
  POPULARITY_IMPORTANCE,
  WINRATE_IMPORTANCE,
} from "../settings";
import { Deck } from "../utils/types";

describe("calculateDeckScore", () => {
  it("calculates strength, popularity, and the weighted composite score", () => {
    const mockCards = {
      "2 Pikachu base 1": { winCount: 10, totalGames: 20, score: 0.8 },
      "1 Charizard base 2": { winCount: 15, totalGames: 20, score: 0.9 },
    };

    const mockDeck: Deck = {
      id: "test-1",
      name: "Test Deck",
      cards: [
        { name: "Pikachu", count: 2, set: "base", number: "1" },
        { name: "Charizard", count: 1, set: "base", number: "2" },
      ],
      pokemon: 3,
      differentPokemon: 2,
      winCount: 10,
      lossCount: 5,
      totalGames: 15,
      date: "2024-01-01",
      tournamentExPercent: 0,
      noTrainerPercent: 0,
      wins: [],
      losses: [],
    };

    const matchingGames = 20;
    const allGames = 100;

    const score = calculateDeckScore(
      mockDeck,
      mockCards,
      matchingGames,
      allGames
    );
    expect(score.strength).toBeCloseTo(
      (0.8 * 2 + 0.9) / CARDS_IN_DECK,
      10
    );
    expect(score.popularity).toBeCloseTo(0.2, 10);
    expect(score.score).toBeCloseTo(
      ((0.8 * 2 + 0.9) / CARDS_IN_DECK) * WINRATE_IMPORTANCE +
        0.2 * POPULARITY_IMPORTANCE,
      10
    );
  });
});
