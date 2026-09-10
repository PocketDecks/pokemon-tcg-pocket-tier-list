import { createContext, useMemo, useState, ReactNode } from "react";
import { FREE_DECK_AMOUNT } from "../app/constants";

export enum SortBy {
  SCORE = "score",
  POPULARITY = "popularity",
  STRENGTH = "strength",
  WIN_RATE = "winRate",
  POWER = "power",
  META = "meta",
}

interface FilterContextType {
  energy: string | null;
  setEnergy: (energy: string | null) => void;
  includeEx: boolean;
  setIncludeEx: (include: boolean) => void;
  deckAmount: number;
  setDeckAmount: (deckAmount: number) => void;
  sortBy: SortBy;
  setSortBy: (sortBy: SortBy) => void;
  expansion: string | null;
  setExpansion: (expansion: string | null) => void;
  latestExpansionCards: number | null;
  setLatestExpansionCards: (count: number | null) => void;
}

export const FilterContext = createContext<FilterContextType>({
  energy: null,
  setEnergy: () => { },
  includeEx: true,
  setIncludeEx: () => { },
  deckAmount: FREE_DECK_AMOUNT,
  setDeckAmount: () => { },
  sortBy: SortBy.POWER,
  setSortBy: () => { },
  expansion: null,
  setExpansion: () => { },
  latestExpansionCards: null,
  setLatestExpansionCards: () => { },
});

interface Props {
  children: ReactNode;
}

const FilterContextProvider = ({ children }: Props) => {
  const [energy, setEnergy] = useState<string | null>(null);
  const [includeEx, setIncludeEx] = useState<boolean>(true);
  const [deckAmount, setDeckAmount] = useState<number>(FREE_DECK_AMOUNT);
  const [sortBy, setSortBy] = useState<SortBy>(SortBy.POWER);
  const [expansion, setExpansion] = useState<string | null>(null);
  const [latestExpansionCards, setLatestExpansionCards] = useState<number | null>(null);

  const value = useMemo(
    () => ({
      energy,
      setEnergy,
      includeEx,
      setIncludeEx,
      deckAmount,
      setDeckAmount,
      sortBy,
      setSortBy,
      expansion,
      setExpansion,
      latestExpansionCards,
      setLatestExpansionCards,
    }),
    [
      energy,
      setEnergy,
      includeEx,
      setIncludeEx,
      deckAmount,
      setDeckAmount,
      sortBy,
      setSortBy,
      expansion,
      setExpansion,
      latestExpansionCards,
      setLatestExpansionCards,
    ]
  );

  return (
    <FilterContext.Provider value={value}>
      {children}
    </FilterContext.Provider>
  );
};

export default FilterContextProvider;
