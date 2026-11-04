import { useQuery } from "@tanstack/react-query";
import { CardType, fetchCards } from "./cards-api";
import { parseScoreRef } from "./card-ref";
import useFilters from "./use-filters";
import useMissing from "./use-missing";
import { EXPANSIONS_URL } from "./constants";

const knownSets = new Set((EXPANSIONS_URL as { id: string }[]).map((entry) => entry.id));

export interface CardScoreType extends CardType {
  count: number;
  score: number;
  popularity: number;
}

export interface UseCardsResult {
  cards: CardScoreType[] | null;
  error: Error | null;
  retry: () => Promise<void>;
}

interface UseCardsOptions {
  ignoreExpansionFilter?: boolean;
  ignoreCollection?: boolean;
}

type ScoreRow = {
  name: string;
  score: number;
  popularity: number;
};

const isValidScoreRow = (row: unknown): row is ScoreRow => {
  if (typeof row !== "object" || row === null) return false;
  const candidate = row as Partial<ScoreRow>;
  if (typeof candidate.name !== "string") return false;
  const parts = candidate.name.split(" ");
  if (parts.length < 3) return false;
  if (!/^\d+$/.test(parts[0])) return false;
  if (!parts[parts.length - 2]) return false;
  if (!/^\d{1,3}$/.test(parts[parts.length - 1])) return false;
  if (!knownSets.has(parseScoreRef(candidate.name).set)) return false;
  return typeof candidate.score === "number" && Number.isFinite(candidate.score) && candidate.score >= 0 && typeof candidate.popularity === "number" && Number.isFinite(candidate.popularity) && candidate.popularity >= 0;
};

export const parseCardScores = (payload: unknown): ScoreRow[] => {
  if (!Array.isArray(payload)) {
    throw new Error("Card score payload is not an array");
  }
  for (const row of payload) {
    if (!isValidScoreRow(row)) {
      throw new Error("Card score payload contains an invalid row");
    }
  }
  return payload;
};

export const fetchCardScores = async (): Promise<ScoreRow[]> => {
  const response = await fetch("/data/card-scores.json");
  if (!response.ok) {
    throw new Error(`Card score request failed with status ${response.status}`);
  }
  return parseCardScores(await response.json());
};

const useCards = (amount: number = 30, options: UseCardsOptions = {}): UseCardsResult => {
  const { expansion: chosenExpansion } = useFilters();
  const expansion = options.ignoreExpansionFilter ? null : chosenExpansion;
  const { missing: collected } = useMissing();

  const {
    data: cardsPayload,
    error: cardsError,
    refetch: refetchCards,
  } = useQuery({
    queryKey: ["cards"],
    queryFn: fetchCards,
  });
  const cardData = cardsPayload?.cards;

  const {
    data: cards,
    error: scoresError,
    refetch: refetchScores,
  } = useQuery({
    queryKey: ["card-scores"],
    queryFn: fetchCardScores,
  });

  const error = scoresError ?? cardsError;
  const retry = async () => {
    await Promise.all([refetchScores(), refetchCards()]);
  };

  if (!cardData || !cards) {
    return {
      cards: null,
      error: error as Error | null,
      retry,
    };
  }

  const ownedIds: string[] = options.ignoreCollection ? [] : collected;
  const collectedCounts = ownedIds.reduce<Record<string, number>>((acc, id) => {
    acc[id] = (acc[id] || 0) + 1;
    return acc;
  }, {});

  const sortedCards = cards
      .filter((card: ScoreRow) => {
        const { id, count } = parseScoreRef(card.name);
        return options.ignoreCollection || count - (collectedCounts[id] || 0) > 0;
      })
      .sort((a, b) => b.score - a.score);

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

  const ranked = outputCards
      .sort((a, b) => b.popularity - a.popularity)
      .slice(0, amount)
      .sort((a, b) => b.score - a.score);

  return { cards: ranked, error: error as Error | null, retry };
};

export default useCards;
