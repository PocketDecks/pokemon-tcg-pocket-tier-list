import React, { createContext, useContext, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import useMissing from "../app/use-missing";
import useFilters from "../app/use-filters";
import useIsPremium from "../app/use-is-premium";
import type { CardType } from "../app/cards-api";
import useExpansions from "../app/use-expansions";
import { newestExpansion } from "../app/expansion-policy.mjs";
import type {
  MetaShareEntry,
  PipelineMetaShare,
  PipelinePartialDeck,
} from "../types/pipeline-data";
import type { FullDeckType, MatchupType } from "../app/deck-types";
import { settleAllNewShares } from "../app/meta-share-window";
import { buildDecks } from "../app/build-decks";
import { resolveDeckDetail } from "../app/deck-resolution";
import {
  fetchBestDecks,
  fetchMatchupData,
  loadMetaShare,
  sanitiseMatchupData,
} from "../app/deck-payload";
import { getScoreBaseline, type ScoreBaseline } from "../app/score-baseline";
import {
  isPremiumMetaWindow,
  type ArtefactTier,
  type MetaWindow,
} from "../app/meta-window";
import { PremiumAccessError } from "../app/premium-data";
import { decksKey, matchupsKey, metaShareKey } from "../app/query-keys";
import { useMetaWindow } from "../app/use-meta-window";

export type { CardType };
export type { FullDeckType };
export type { MatchupType };
export { sanitiseMatchupData };

interface DecksShared {
  rawDecks: PipelinePartialDeck[] | null;
  metaShare: PipelineMetaShare | null;
  metaShareBySlug: Record<string, MetaShareEntry> | null;
  isPremium: boolean | null;
}

/// `ready` is the only state with a deck list; `error` is reported only while
/// there is none. `scoreBaseline` is null when no deck has a finite power score.
export type DecksState = DecksShared &
  (
    | { status: "loading"; decks: null; scoreBaseline: null }
    | { status: "error"; decks: null; scoreBaseline: null; error: Error }
    | { status: "ready"; decks: FullDeckType[]; scoreBaseline: ScoreBaseline | null }
  );

const DecksContext = createContext<DecksState | undefined>(undefined);

export const DecksProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { missingCounts } = useMissing();
  const { energy, includeEx, deckAmount, sortBy, latestExpansionCards } = useFilters();
  const isPremium = useIsPremium();
  const expansions = useExpansions();
  const { window } = useMetaWindow();

  const { data: rawDecks = null, error: decksError } = useDecksData(window);
  const { data: metaShare } = useMetaShareData(window);

  const scoreBaseline = useMemo(
    () => (rawDecks ? getScoreBaseline(rawDecks) : null),
    [rawDecks]
  );

  const settledMetaShare = useMemo<PipelineMetaShare | null>(() => {
    if (!metaShare) return null;
    return { ...metaShare, decks: settleAllNewShares(metaShare.decks) };
  }, [metaShare]);

  const metaShareBySlug = useMemo(() => {
    if (!settledMetaShare) return null;
    return Object.fromEntries(
      settledMetaShare.decks.map((d) => [d.name, d])
    ) as Record<string, MetaShareEntry>;
  }, [settledMetaShare]);

  const latestExpansionId = useMemo(
    () => newestExpansion(expansions)?.id ?? null,
    [expansions]
  );

  const decks = useMemo(() => {
    if (!rawDecks) return null;
    return buildDecks(rawDecks, {
      missingCounts,
      energy,
      includeEx,
      deckAmount,
      sortBy,
      latestExpansionId,
      latestExpansionCards,
      applyPairedTrim: energy === null,
    });
  }, [
    rawDecks,
    missingCounts,
    energy,
    includeEx,
    deckAmount,
    sortBy,
    latestExpansionCards,
    latestExpansionId,
  ]);

  const value = useMemo<DecksState>(() => {
    const shared = {
      rawDecks,
      metaShare: settledMetaShare,
      metaShareBySlug,
      isPremium,
    };
    if (decks !== null) {
      return { ...shared, status: "ready", decks, scoreBaseline };
    }
    if (decksError) {
      return { ...shared, status: "error", decks: null, scoreBaseline: null, error: decksError };
    }
    return { ...shared, status: "loading", decks: null, scoreBaseline: null };
  }, [
    decks,
    rawDecks,
    scoreBaseline,
    settledMetaShare,
    metaShareBySlug,
    decksError,
    isPremium,
  ]);

  return (
    <DecksContext.Provider value={value}>{children}</DecksContext.Provider>
  );
};

export const useDecks = () => {
  const context = useContext(DecksContext);
  if (context === undefined) {
    throw new Error("useDecks must be used within a DecksProvider");
  }
  return context;
};

export const useMatchups = () => {
  const { window } = useMetaWindow();
  const isPremium = useIsPremium();
  const { data, isLoading, error } = useQuery({
    queryKey: matchupsKey(window),
    queryFn: () => fetchMatchupData(window),
    retry: 1,
    ...windowQueryOptions(window, isPremium),
  });
  return { matchupsByName: data ?? null, loading: isLoading, error: error ?? null };
};

/// Detail-page deck resolution. Kept out of the provider so only deck pages
/// pay for it, but sharing the provider's query keys means no extra fetches.
export const useDeckDetail = (
  deckId: string | undefined,
  missingCounts: Record<string, number>
) => {
  const { window } = useMetaWindow();
  const { data: rawDecks } = useDecksData(window);
  return useMemo(() => {
    if (!rawDecks || !deckId) {
      return { deck: null, extinct: false };
    }
    const resolved = resolveDeckDetail(rawDecks, deckId, missingCounts);
    return {
      deck: resolved?.deck ?? null,
      extinct: resolved?.extinct ?? false,
    };
  }, [rawDecks, deckId, missingCounts]);
};

const PREMIUM_LOAD_ATTEMPTS = 3;

const retryUnlessDenied = (failureCount: number, error: Error): boolean =>
  !(error instanceof PremiumAccessError) && failureCount < PREMIUM_LOAD_ATTEMPTS - 1;

const windowQueryOptions = (window: MetaWindow, isPremium: boolean | null) => ({
  enabled: !isPremiumMetaWindow(window) || isPremium === true,
  ...(isPremiumMetaWindow(window) ? { retry: retryUnlessDenied } : {}),
});

const tierOf = (isPremium: boolean | null): ArtefactTier =>
  isPremium === true ? "full" : "public";

const useDecksData = (window: MetaWindow) => {
  const isPremium = useIsPremium();
  return useQuery({
    queryKey: decksKey(window),
    queryFn: () => fetchBestDecks(window),
    ...windowQueryOptions(window, isPremium),
  });
};

const useMetaShareData = (window: MetaWindow) => {
  const isPremium = useIsPremium();
  const tier = tierOf(isPremium);
  return useQuery({
    queryKey: metaShareKey(window, tier),
    queryFn: () => loadMetaShare(window, tier),
    ...windowQueryOptions(window, isPremium),
  });
};
