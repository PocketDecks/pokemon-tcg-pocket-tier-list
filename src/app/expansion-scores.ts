import type { ExpansionType } from "./use-expansions";

interface CardScoreInput {
  set: string;
  pack: string;
  score: number;
}

export interface ExpansionPackData {
  expansionId: string;
  packId: string;
  packName: string;
  packImage: string;
  totalScore: number;
  averageScore: number;
}

interface PackScore {
  total: number;
  count: number;
}

const scoreForPack = (
  scores: CardScoreInput[],
  expansion: ExpansionType,
  packName: string
): PackScore => {
  const direct = scores.filter(
    (card) => card.set === expansion.id && card.pack === packName
  );
  const shared = scores.filter(
    (card) =>
      card.set === expansion.id && card.pack.toLowerCase().includes("shared")
  );
  const directTotal = direct.reduce((sum, card) => sum + card.score, 0);
  const sharedTotal = shared.reduce((sum, card) => sum + card.score, 0);

  if (directTotal > 0) {
    return {
      total: directTotal + sharedTotal,
      count: direct.length + shared.length,
    };
  }

  if (expansion.packs.length === 1) {
    return scores
      .filter((card) => card.set === expansion.id)
      .reduce(
        (result, card) => ({
          total: result.total + card.score,
          count: result.count + 1,
        }),
        { total: 0, count: 0 }
      );
  }

  return { total: sharedTotal, count: shared.length };
};

export const buildExpansionPackData = (
  scores: CardScoreInput[],
  expansions: ExpansionType[]
): ExpansionPackData[] =>
  expansions
    .flatMap((expansion) =>
      expansion.packs.flatMap((pack) => {
        if (!pack.image) return [];
        const packScore = scoreForPack(scores, expansion, pack.name);
        if (packScore.total <= 0 || packScore.count === 0) return [];
        const averageScore = packScore.total / packScore.count;
        return [
          {
            expansionId: expansion.id,
            packId: pack.id,
            packName: pack.name,
            packImage: pack.image,
            totalScore: packScore.total,
            averageScore,
          },
        ];
      })
    )
    .sort((a, b) => b.averageScore - a.averageScore);
