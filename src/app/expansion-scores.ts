import type { ExpansionType } from "./use-expansions";
import { isListedExpansion } from "./expansion-policy.mjs";

interface CardScoreInput {
  set: string;
  pack: string;
  score: number;
}

export interface ExpansionData {
  expansionId: string;
  name: string;
  packImages: string[];
  totalScore: number;
  averageScore: number;
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

const compareIds = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export const isSharedPack = (pack: string) => pack.toLowerCase().includes("shared");

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
      card.set === expansion.id && isSharedPack(card.pack)
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

export const buildExpansionData = (
  scores: CardScoreInput[],
  expansions: ExpansionType[]
): ExpansionData[] =>
  expansions
    .filter((expansion) => isListedExpansion(expansion))
    .flatMap((expansion) => {
      const packImages = expansion.packs.flatMap((pack) => (pack.image ? [pack.image] : []));
      const cards = scores.filter((card) => card.set === expansion.id);
      const totalScore = cards.reduce((sum, card) => sum + card.score, 0);
      if (packImages.length === 0 || cards.length === 0 || totalScore <= 0) return [];
      return [
        {
          expansionId: expansion.id,
          name: expansion.name,
          packImages,
          totalScore,
          averageScore: totalScore / cards.length,
        },
      ];
    })
    .sort((a, b) => b.averageScore - a.averageScore || compareIds(a.expansionId, b.expansionId));

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
    .sort(
      (a, b) =>
        b.averageScore - a.averageScore ||
        compareIds(a.expansionId, b.expansionId) ||
        compareIds(a.packId, b.packId)
    );
