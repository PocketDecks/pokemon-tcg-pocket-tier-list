import { useQuery } from "@tanstack/react-query";
import { CardType, fetchCards } from "./cards-api";
import { parseScoreRef } from "./card-ref";
import useFilters from "./use-filters";
import useMissing from "./use-missing";

export interface CardScoreType extends CardType {
  count: number;
  score: number;
  popularity: number;
}

interface UseCardsOptions {
  ignoreExpansionFilter?: boolean;
}

const useCards = (amount: number = 30, options: UseCardsOptions = {}): CardScoreType[] | null => {
  const { expansion: chosenExpansion } = useFilters();
  const expansion = options.ignoreExpansionFilter ? null : chosenExpansion;
  const { missing: collected } = useMissing();

  const { data: cardsPayload } = useQuery({
    queryKey: ["cards"],
    queryFn: fetchCards,
  });
  const cardData = cardsPayload?.cards;

  const { data: cards } = useQuery({
    queryKey: ["card-scores"],
    queryFn: async () => {
      const response = await fetch("/data/card-scores.json");
      return (await response.json()) as CardScoreType[];
    },
  });

  if (!cardData || !cards) return null;

  const collectedCounts = collected.reduce<Record<string, number>>((acc, id) => {
    acc[id] = (acc[id] || 0) + 1;
    return acc;
  }, {});

  const sortedCards = cards
      .filter((card: CardScoreType) => {
        const { id, count } = parseScoreRef(card.name);
        return count - (collectedCounts[id] || 0) > 0;
      })
      .sort((a: CardScoreType, b: CardScoreType) => b.score - a.score);

  const seenIds = new Set<string>();
  const unresolvedIds = new Set<string>();
  const outputCards: CardScoreType[] = [];

  for (const card of sortedCards) {
    const { id, count, set } = parseScoreRef(card.name);
    if (expansion && set !== expansion) continue;

    if (seenIds.has(id)) continue;
    seenIds.add(id);

    const collectedCount = collectedCounts[id] || 0;
    const cardInfo = cardData.find((c: CardType) => c.id === id);
    if (!cardInfo) {
      unresolvedIds.add(id);
      continue;
    }

    const score = Math.sqrt(card.score);

    outputCards.push({
      ...cardInfo,
      score,
      popularity: card.popularity,
      set,
      count: Math.max(0, count - collectedCount),
    });
  }

  if (unresolvedIds.size > 0) {
    console.warn(
        `Skipped ${unresolvedIds.size} scored card id(s) missing from the card data: ${Array.from(
            unresolvedIds
        ).join(", ")}`
    );
  }

  return outputCards
      .sort((a: CardScoreType, b: CardScoreType) => b.popularity - a.popularity)
      .slice(0, amount)
      .sort((a: CardScoreType, b: CardScoreType) => b.score - a.score);
};

export default useCards;