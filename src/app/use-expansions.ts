import { useQuery } from "@tanstack/react-query";
import { EXPANSIONS_URL } from "./constants";
import { isListedExpansion, newestExpansion } from "./expansion-policy.mjs";

export interface PackType {
  id: string;
  name: string;
  image: string | null;
}

export interface ExpansionType {
  id: string;
  name: string;
  release_date: string | null;
  packs: PackType[];
}

const ALL_EXPANSIONS = EXPANSIONS_URL as unknown as ExpansionType[];

export const latestExpansionName = (): string | null =>
  newestExpansion(ALL_EXPANSIONS)?.name ?? null;

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
