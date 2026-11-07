import { useMemo } from "react";
import { freeDeckNames } from "./free-tier";
import { useDecks } from "./use-decks";

const useFreeDeckNames = (): Set<string> => {
  const { rawDecks, decks } = useDecks();
  return useMemo(() => freeDeckNames(rawDecks ?? decks ?? []), [rawDecks, decks]);
};

export default useFreeDeckNames;
