import { useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { useMemo } from "react";
import { useDecks, useDeckDetail, useMatchups } from "../../app/use-decks";
import useMissing from "../../app/use-missing";
import { formatCardScore } from "../../app/format-card-score";
import { CARDS_BY_ID, type CardType } from "../../app/cards-api";
import DeckCardGrid from "./DeckCardGrid";
import DeckHeadTags from "./DeckHeadTags";
import DeckHubLink from "./DeckHubLink";
import { MIN_MATCHUP_GAMES, WINRATE_THRESHOLD } from "../../app/config";
import useIsPremium from "../../app/use-is-premium";
import useFreeDeckNames from "../../app/use-free-deck-names";
import { useMetaWindow } from "../../app/use-meta-window";
import useWindowSearchParam from "../../app/use-window-search-param";
import ShareDeckCode from "../../components/ShareDeckCode";
import Tooltip from "../../components/Tooltip";
import type { MetaShareEntry } from "../../types/pipeline-data";
import NavIcon from "../../components/NavIcon";
import AdInContent from "../../ads/AdInContent";
import SeoContent from "../../components/SeoContent";
import { useMarkContentReady } from "../../ads/ContentReadyContext";
import { countById, oneSwapAlternatives } from "../../app/deck-diff";
import { deckDisplayName } from "../../app/deck-display";
import DeckHero from "./DeckHero";
import DeckEmptyState from "./DeckEmptyState";
import MatchupListSection from "./MatchupListSection";
import { buildHeroStats } from "./hero-stats";
import { uniqueCardsById } from "../../app/unique-cards";
import DeckPageSkeleton from "./DeckPageSkeleton";
import NotFoundPage from "../not-found/NotFoundPage";
import useDeckTiers, { tierForDeck } from "../../app/use-deck-tiers";
import { useLocaleHref } from "../../app/locale-link";
import {
  cardThumbHeight,
  cardThumbSrcSet,
  cardThumbUrl,
  onDeckThumbError,
} from "../../app/deck-thumb";
import {
  AlternativeSwap,
  BackIcon,
  BackToTierList,
  CardSection,
  KeyStats,
  KeyStatRow,
  KeyStatValue,
  MatchupNotice,
  MatchupSection,
  Matchups,
  Overlay,
  PanelSection,
  StyledDeckPage,
  StyledLink,
  SubHeader,
  SwapArrow,
  SwapCount,
  SwapLabel,
  SwapName,
  SwapSide,
  UndoButton,
} from "./deck-page.styles";

const SWAP_THUMB_WIDTH = 240;

const SwapThumb = ({ card }: { card: CardType }) => (
  <img
    src={cardThumbUrl(card.id, SWAP_THUMB_WIDTH)}
    srcSet={cardThumbSrcSet(card.id)}
    sizes="135px"
    width={SWAP_THUMB_WIDTH}
    height={cardThumbHeight(SWAP_THUMB_WIDTH)}
    alt=""
    loading="lazy"
    onError={onDeckThumbError(card.image)}
  />
);

const DeckDetailPage = () => {
  const deckId = useParams().deckId;
  const decksState = useDecks();
  const { decks, metaShareBySlug } = decksState;
  const { matchupsByName, loading: matchupsLoading, error: matchupsError } = useMatchups();
  const tiers = useDeckTiers(decks);
  const { missingCounts, canUndo, undoMissing, lastRemovedId } = useMissing();
  const { t } = useTranslation();
  const tierListHref = useLocaleHref("/tier-list");
  const premiumHref = useLocaleHref("/about#premium");
  const isPremium = useIsPremium();
  const freeNames = useFreeDeckNames();
  const { window: metaWindow } = useMetaWindow();
  useWindowSearchParam();

  const { deck, extinct } = useDeckDetail(deckId, missingCounts);
  const lastCutName = lastRemovedId
    ? (CARDS_BY_ID.get(lastRemovedId)?.name ?? null)
    : null;
  const shareEntry: MetaShareEntry | null =
    metaShareBySlug?.[deckId ?? ""] ?? null;
  const deckMatchups = deck ? matchupsByName?.[deck.name] : undefined;
  const isFreeDeck = !!deck && freeNames.has(deck.name);
  const matchupsLocked = isPremium === false && !!deck && !isFreeDeck;
  const matchupsPending = matchupsLoading || (isPremium === null && !isFreeDeck);

  // Ready (for showing ads) only once a real deck is resolved, never on the
  // loading or "not enough cards" screens.
  useMarkContentReady(decksState.status !== "loading" && !!deck);

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
    const uniqueCards = uniqueCardsById(deck.bestList.cards);
    const cardCounts = countById(deck.bestList.cards);
    const alternatives = oneSwapAlternatives(deck.bestList, deck.lists, 3);
    const validMatchups =
      deckMatchups?.filter(
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
  }, [deck, deckMap, deckMatchups, extinct]);

  if (decksState.status === "loading") return <DeckPageSkeleton />;
  if (decksState.status === "error") return <Overlay>{t("common.loadError", { message: decksState.error.message })}</Overlay>;
  if (!derived || !deck) return <NotFoundPage />;

  if (extinct) {
    return (
      <DeckEmptyState
        shrug={t("deckPage.extinctShrug")}
        message={
          lastCutName
            ? t("deckPage.extinctBody", {
                card: lastCutName,
                defaultValue: `That was the last copy of ${lastCutName}. There is no version of this deck left to build.`,
              })
            : t(
                "deckPage.extinctBodyNoCard",
                "Every version of this deck needs a card you have marked as missing. There is nothing left to build."
              )
        }
        onUndo={undoMissing}
      />
    );
  }

  const { uniqueCards, cardCounts, alternatives, strongAgainst, weakAgainst } =
    derived;

  const totalMatchup = deckMatchups?.find((m) => m.name === "Total");
  const winRatePct = totalMatchup ? Math.round(totalMatchup.winRate * 100) : null;

  const displayName = deckDisplayName(deck);
  const heroStats = buildHeroStats({
    t,
    winRatePct: matchupsLoading ? "loading" : winRatePct,
    metaShare: shareEntry?.share,
    energyIds: deck.bestList.energyIds,
  });

  return (
    <>
      <DeckHeadTags deck={deck} />
      <DeckHero deck={deck} tier={tierForDeck(tiers, deck.id)} stats={heroStats} />
      <BackToTierList to={tierListHref}>
        <BackIcon name="arrowRight" size={18} />
        {t("notFound.backToTierList", "Back to the tier list")}
      </BackToTierList>
      <DeckHubLink variant={deckId ?? ""} />
      <StyledDeckPage>
        <CardSection>
          <DeckCardGrid cards={uniqueCards} counts={cardCounts} />
          {canUndo && (
            <UndoButton onClick={undoMissing}>{t("deckPage.undo")}</UndoButton>
          )}
          <AdInContent placement="deck" />
        </CardSection>
        <PanelSection>
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
                  <Tooltip
                    text={t("deckPage.freqScoreTooltip")}
                    ariaLabel={t("deckPage.showTooltip")}
                  />
                </KeyStatRow>
                <KeyStatRow>
                  <span>{t("deckPage.metaScore")}:</span>
                  <KeyStatValue>
                    {deck.metaScore === null
                      ? t("deckPage.unranked")
                      : deck.metaScore.toFixed(1)}
                  </KeyStatValue>
                  <Tooltip
                    text={t("deckPage.metaScoreTooltip")}
                    ariaLabel={t("deckPage.showTooltip")}
                  />
                </KeyStatRow>
                <KeyStatRow>
                  <span>{t("deckPage.cardScore")}:</span>
                  <KeyStatValue>{formatCardScore(deck.strength)}</KeyStatValue>
                  <Tooltip
                    text={t("deckPage.cardScoreTooltip")}
                    ariaLabel={t("deckPage.showTooltip")}
                  />
                </KeyStatRow>
                <KeyStatRow>
                  <span>
                    {t("deckPage.popularity")} ({t(`windowDays.${metaWindow}`)}):
                  </span>
                  <KeyStatValue>
                    {shareEntry ? Math.round(shareEntry.windowGames).toLocaleString() : "—"}
                  </KeyStatValue>
                  <Tooltip
                    text={t("deckPage.popularityTooltip", {
                      days: t(`windowDays.${metaWindow}`),
                    })}
                    ariaLabel={t("deckPage.showTooltip")}
                  />
                </KeyStatRow>
              </KeyStats>
            </MatchupSection>

            <MatchupSection>
              <SubHeader $backgroundColor="var(--c)">
                {t("deckPage.shareQrPanel", "Deck Code and QR Code")}
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
                  <AlternativeSwap
                    key={`${list.score}-${list.cards.map((c) => c.id).join("-")}`}
                  >
                    <SwapSide $out>
                      <SwapThumb card={diff.removed[0]} />
                      <SwapLabel>
                        <SwapCount $out>{`−${diff.removed.length}`}</SwapCount>
                        <SwapName>{diff.removed[0].name}</SwapName>
                      </SwapLabel>
                    </SwapSide>
                    <SwapArrow aria-hidden="true">
                      <NavIcon name="arrowRight" size={20} />
                    </SwapArrow>
                    <SwapSide $out={false}>
                      <SwapThumb card={diff.added[0]} />
                      <SwapLabel>
                        <SwapCount $out={false}>{`+${diff.added.length}`}</SwapCount>
                        <SwapName>{diff.added[0].name}</SwapName>
                      </SwapLabel>
                    </SwapSide>
                  </AlternativeSwap>
                ))}
              </MatchupSection>
            )}

            {matchupsLocked ? (
              <MatchupSection>
                <SubHeader $backgroundColor="var(--c)">
                  {t("deckPage.matchups")}
                </SubHeader>
                <MatchupNotice>
                  <span>{t("deckPage.matchupsPremium")}</span>
                  <StyledLink to={premiumHref}>{t("deckPage.premiumGateAction")}</StyledLink>
                </MatchupNotice>
              </MatchupSection>
            ) : (
              <>
                <MatchupListSection
                  title={t("deckPage.strongAgainst")}
                  headerColour="var(--f)"
                  pending={matchupsPending}
                  failed={!!matchupsError}
                  matchups={strongAgainst}
                  decksByName={deckMap}
                />
                <MatchupListSection
                  title={t("deckPage.weakAgainst")}
                  headerColour="var(--s)"
                  pending={matchupsPending}
                  failed={!!matchupsError}
                  matchups={weakAgainst}
                  decksByName={deckMap}
                />
              </>
            )}
          </Matchups>
        </PanelSection>
      </StyledDeckPage>

      <SeoContent>
        <h2>{t("deckDetail.heading", { ns: "seo", deck: displayName })}</h2>
        <p>
          {t("deckDetail.intro", { ns: "seo", deck: displayName })}{" "}
          <a href={tierListHref}>{t("deckDetail.tierList", { ns: "seo" })}</a>{" "}
          {t("deckDetail.introAfter", { ns: "seo" })}
          {winRatePct !== null
            ? t("deckDetail.winRate", { ns: "seo", winRate: winRatePct })
            : ""}
        </p>
        <p>{t("deckDetail.body", { ns: "seo" })}</p>
        <p>
          {t("deckDetail.outro", { ns: "seo" })}{" "}
          <a href={tierListHref}>{t("deckDetail.tierList", { ns: "seo" })}</a>{" "}
          {t("deckDetail.outroAfter", { ns: "seo" })}
        </p>
      </SeoContent>
    </>
  );
};

export default DeckDetailPage;
