import { useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { useMemo } from "react";
/* eslint-disable-next-line no-restricted-imports -- pre-existing: this page
   still consumes DecksContext directly. Move behind src/app/ before adding more. */
import { useDecks, useDeckDetail, MatchupType } from "../../contexts/DecksContext";
import useMissing from "../../app/use-missing";
import { useQuery } from "@tanstack/react-query";
import { CardType, fetchCards } from "../../app/cards-api";
import DeckCardGrid from "./DeckCardGrid";
import DeckHeadTags from "./DeckHeadTags";
import DeckCard from "../../components/DeckCard";
import { MIN_MATCHUP_GAMES, WINRATE_THRESHOLD } from "../../app/config";
import useIsPremium from "../../app/use-is-premium";
import UserAccount from "../../components/UserAccount";
import ShareDeckCode from "../../components/ShareDeckCode";
import Tooltip from "../../components/Tooltip";
import type { MetaShareEntry } from "../../types/pipeline-data";
import arrowRight from "../../assets/arrow-right.svg";
import AdInContent from "../../ads/AdInContent";
import SeoContent from "../../components/SeoContent";
import { useMarkContentReady } from "../../ads/ContentReadyContext";
import { countById, oneSwapAlternatives } from "../../app/deck-diff";
import { deckDisplayName } from "../../app/deck-display";
import {
  AlternativeCard,
  AlternativeContainer,
  ArrowRight,
  CardSection,
  DeckCardContainer,
  EmptyActions,
  EmptyMessage,
  KeyStats,
  KeyStatRow,
  KeyStatValue,
  MatchupContainer,
  MatchupLabel,
  MatchupList,
  MatchupSection,
  Matchups,
  Or,
  Overlay,
  PanelSection,
  Shrug,
  StyledDeckPage,
  StyledLink,
  SubHeader,
  UndoButton,
} from "./deck-page.styles";

const DeckDetailPage = () => {
  const deckId = useParams().deckId;
  const { decks, metaShareBySlug, loading, error } = useDecks();
  const { missing, canUndo, undoMissing, lastRemovedId } = useMissing();
  const { t } = useTranslation();
  const isPremium = useIsPremium();

  const missingCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const id of missing) counts[id] = (counts[id] || 0) + 1;
    return counts;
  }, [missing]);

  const { deck, extinct } = useDeckDetail(deckId, missingCounts);
  // Card data for resolving the removed card's name in the extinct notice.
  // React Query dedupes this against the same queryKey used elsewhere, so it is
  // a cache read, not a second network fetch.
  const { data: cardsPayload } = useQuery({
    queryKey: ["cards"],
    queryFn: fetchCards,
  });
  const cardsById = new Map(
    (cardsPayload?.cards ?? []).map((card) => [card.id, card] as [string, CardType])
  );
  const lastCutName = lastRemovedId
    ? (cardsById.get(lastRemovedId)?.name ?? null)
    : null;
  const shareEntry: MetaShareEntry | null =
    metaShareBySlug?.[deckId ?? ""] ?? null;

  // Ready (for showing ads) only once a real deck is resolved, never on the
  // loading or "not enough cards" screens.
  useMarkContentReady(!loading && !!deck);

  // Opponent tiles only; the viewed deck resolves through useDeckDetail. A
  // filter or the paired trim can drop an opponent from `decks`, which
  // validMatchups then filters out rather than crashing on.
  const deckMap = useMemo(
    () => new Map((decks ?? []).map((d) => [d.name, d])),
    [decks]
  );

  // Everything here depends on the resolved deck, so it is computed once per
  // deck change instead of once per render.
  const derived = useMemo(() => {
    if (!deck) return null;
    // Total extinction: the resolved (unfiltered) object would resurrect cut
    // cards, so render an empty grid while the page stays up for Undo.
    if (extinct) {
      return {
        uniqueCards: [],
        cardCounts: new Map<string, number>(),
        alternatives: [],
        strongAgainst: [],
        weakAgainst: [],
      };
    }
    const uniqueCards = deck.bestList.cards.filter(
      (card, index, self) =>
        self.findIndex((c) => c.id === card.id) === index
    );
    const cardCounts = countById(deck.bestList.cards);
    const alternatives = oneSwapAlternatives(deck.bestList, deck.lists, 3);
    const validMatchups =
      deck.matchups?.filter(
        (m) =>
          m &&
          m.totalGames > MIN_MATCHUP_GAMES &&
          m.name !== deck.name &&
          deckMap.has(m.name)
      ) || [];
    const strongAgainst = validMatchups
      .filter((m) => m.winRate > WINRATE_THRESHOLD)
      .sort((a, b) => {
        const scoreDiff =
          deckMap.get(b.name)!.score - deckMap.get(a.name)!.score;
        return scoreDiff !== 0 ? scoreDiff : b.winRate - a.winRate;
      })
      .slice(0, 6);
    const weakAgainst = validMatchups
      .filter((m) => m.winRate <= WINRATE_THRESHOLD)
      .sort((a, b) => a.winRate - b.winRate)
      .slice(0, 6);
    return {
      uniqueCards,
      cardCounts,
      alternatives,
      strongAgainst,
      weakAgainst,
    };
  }, [deck, deckMap, extinct]);

  if (loading) return <Overlay>Loading...</Overlay>;
  if (error) return <Overlay>Error loading data: {error.message}</Overlay>;
  if (!derived || !deck) return <Overlay>Deck not found</Overlay>;

  if (extinct) {
    return (
      <Overlay>
        <Shrug>{t("deckPage.extinctShrug")}</Shrug>
        {lastCutName ? (
          <EmptyMessage>
            {t("deckPage.extinctBody", {
              card: lastCutName,
              defaultValue: `That was the last copy of ${lastCutName}. There is no version of this deck left to build.`,
            })}
          </EmptyMessage>
        ) : (
          <EmptyMessage>
            {t(
              "deckPage.extinctBodyNoCard",
              "Every version of this deck needs a card you have marked as missing. There is nothing left to build."
            )}
          </EmptyMessage>
        )}
        <EmptyActions>
          <UndoButton onClick={undoMissing}>{t("deckPage.undo")}</UndoButton>
          <Or>{t("deckPage.or")}</Or>
          <StyledLink to="/tier-list">{t("deckPage.tryAnotherDeck")}</StyledLink>
        </EmptyActions>
      </Overlay>
    );
  }

  const { uniqueCards, cardCounts, alternatives, strongAgainst, weakAgainst } =
    derived;

  const totalMatchup = deck.matchups?.find((m) => m.name === "Total");
  const winRatePct = totalMatchup ? Math.round(totalMatchup.winRate * 100) : null;

  const displayName = deckDisplayName(deck);

  return (
    <>
      <DeckHeadTags deck={deck} />
      <StyledDeckPage>
        <CardSection>
          <DeckCardGrid cards={uniqueCards} counts={cardCounts} />
          {canUndo && (
            <UndoButton onClick={undoMissing}>{t("deckPage.undo")}</UndoButton>
          )}
          <AdInContent placement="deck" />
        </CardSection>
        <PanelSection>
          <UserAccount hideIfPremium />
          <Matchups>
            <MatchupSection>
              <SubHeader $backgroundColor="var(--c)">
                {t("deckPage.keyStats")}
              </SubHeader>
              <KeyStats>
                <KeyStatRow>
                  <span>{t("deckPage.powerScore")}:</span>
                  <KeyStatValue>
                    {deck.powerScore === null
                      ? t("deckPage.unranked")
                      : deck.powerScore.toFixed(1)}
                  </KeyStatValue>
                  <Tooltip
                    text={t("deckPage.powerScoreTooltip")}
                    ariaLabel={t("deckPage.showTooltip")}
                  />
                </KeyStatRow>
                <KeyStatRow>
                  <span>{t("deckPage.freqScore")}:</span>
                  <KeyStatValue>{deck.freqScore.toFixed(1)}</KeyStatValue>
                </KeyStatRow>
                <KeyStatRow>
                  <span>{t("deckPage.metaScore")}:</span>
                  <KeyStatValue>
                    {deck.metaScore === null
                      ? t("deckPage.unranked")
                      : deck.metaScore.toFixed(1)}
                  </KeyStatValue>
                </KeyStatRow>
                <KeyStatRow>
                  <span>{t("deckPage.cardScore")}:</span>
                  <KeyStatValue>{(deck.strength * 10).toFixed(1)}</KeyStatValue>
                  <Tooltip
                    text={t("deckPage.cardScoreTooltip")}
                    ariaLabel={t("deckPage.showTooltip")}
                  />
                </KeyStatRow>
                <KeyStatRow>
                  <span>{t("deckPage.popularity")}:</span>
                  <KeyStatValue>
                    {shareEntry ? Math.round(shareEntry.games14).toLocaleString() : "—"}
                  </KeyStatValue>
                  <Tooltip
                    text={t("deckPage.popularityTooltip")}
                    ariaLabel={t("deckPage.showTooltip")}
                  />
                </KeyStatRow>
              </KeyStats>
            </MatchupSection>

            <MatchupSection>
              <SubHeader $backgroundColor="var(--c)">
                {t("deckPage.shareQrPanel", "Deck Share")}
              </SubHeader>
              <ShareDeckCode
                deckName={deck.name}
                code={deck.bestList.deckCode}
                energyCount={deck.bestList.energyIds.length}
              />
            </MatchupSection>

            {alternatives.length > 0 && (
              <MatchupSection>
                <SubHeader $backgroundColor="var(--c)">
                  {t("deckPage.alternatives")}
                </SubHeader>
                {alternatives.map(({ list, diff }) => (
                  <AlternativeContainer
                    key={`${list.score}-${list.cards.map((c) => c.id).join("-")}`}
                  >
                    <AlternativeCard src={diff.removed[0].image} />
                    <AlternativeCard src={diff.added[0].image} />
                    <ArrowRight src={arrowRight} />
                  </AlternativeContainer>
                ))}
              </MatchupSection>
            )}

            <MatchupSection>
              <SubHeader $backgroundColor="var(--e)">
                {t("deckPage.strongAgainst")}
              </SubHeader>
              <MatchupList $blur={!isPremium}>
                {strongAgainst.map((matchup: MatchupType) => (
                  <MatchupContainer key={matchup.name}>
                    <DeckCardContainer>
                      <DeckCard deck={deckMap.get(matchup.name)!} />
                    </DeckCardContainer>
                    <MatchupLabel $winRate={matchup.winRate}>
                      {`${(matchup.winRate * 100).toFixed(0)}%`}
                    </MatchupLabel>
                  </MatchupContainer>
                ))}
              </MatchupList>
            </MatchupSection>

            <MatchupSection>
              <SubHeader $backgroundColor="var(--s)">
                {t("deckPage.weakAgainst")}
              </SubHeader>
              <MatchupList $blur={!isPremium}>
                {weakAgainst.map((matchup: MatchupType) => (
                  <MatchupContainer key={matchup.name}>
                    <DeckCardContainer>
                      <DeckCard deck={deckMap.get(matchup.name)!} />
                    </DeckCardContainer>
                    <MatchupLabel $winRate={matchup.winRate}>
                      {`${(matchup.winRate * 100).toFixed(0)}%`}
                    </MatchupLabel>
                  </MatchupContainer>
                ))}
              </MatchupList>
            </MatchupSection>
          </Matchups>
        </PanelSection>
      </StyledDeckPage>

      <SeoContent>
        <h2>{displayName} Deck Guide</h2>
        <p>
          {displayName} is a top-rated Pokémon TCG Pocket deck, ranked on our{" "}
          <a href="/tier-list">tier list</a> using recent tournament data.
          {winRatePct !== null
            ? ` It currently holds a ${winRatePct}% win rate across tracked matches.`
            : ""}
        </p>
        <p>
          The recommended decklist above includes standard card counts, alternative swap options,
          and a breakdown of the deck's strengths and weaknesses. Check the matchup data to see
          which decks it counters and which ones to avoid.
        </p>
        <p>
          If you are missing cards for this build, tap them to rebuild the deck around your
          collection. You can also browse the <a href="/tier-list">tier list</a> to find other
          competitive Pokémon TCG Pocket decks.
        </p>
      </SeoContent>
    </>
  );
};

export default DeckDetailPage;
