import { useQuery } from "@tanstack/react-query";
import { EXPANSIONS_URL } from "./constants";
import { isListedExpansion } from "./expansion-policy.mjs";
import { newestCoveredExpansion } from "./expansion-feed.mjs";
import { expansionIndexPolicy } from "./expansion-index-policy.mjs";
import type { FullDeckType } from "./deck-types";
import type { PokemonTCGPocketExpansionsV5Schema } from "pokemon-tcg-pocket-cards/expansions";

export type ExpansionType = PokemonTCGPocketExpansionsV5Schema[number];
export type PackType = ExpansionType["packs"][number];

const ALL_EXPANSIONS = EXPANSIONS_URL;

export const latestCoveredExpansion = (decks: FullDeckType[] | null): ExpansionType | null =>
  newestCoveredExpansion(ALL_EXPANSIONS, decks) ?? null;

export const latestBestListExpansion = (
  rawDecks: readonly { lists?: readonly { score?: number; cards?: readonly unknown[] }[] }[] | null
): ExpansionType | null => expansionIndexPolicy(ALL_EXPANSIONS, rawDecks).newest;

const useExpansions = (): ExpansionType[] | null => {
  const { data: expansions } = useQuery({
    queryKey: ["expansions"],
    queryFn: async () => ALL_EXPANSIONS,
  });

  if (!expansions) return null;

  return expansions.filter((expansion: ExpansionType) =>
    isListedExpansion(expansion)
  );
};

export default useExpansions;
