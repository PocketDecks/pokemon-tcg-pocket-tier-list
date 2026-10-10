import { useTranslation } from "react-i18next";
import { useDecks, useMatchups } from "../../app/use-decks";
import useMissing from "../../app/use-missing";
import {
  relativeToBaseline,
  sortByPowerScore,
} from "../../app/score-baseline";
import DeckCardGrid from "./DeckCardGrid";
import DeckHeadTags from "./DeckHeadTags";
import DeckHero, { type DeckHeroStat } from "./DeckHero";
import DeckPageSkeleton from "./DeckPageSkeleton";
import EnergyList from "./EnergyList";
import useDeckTiers, { tierForDeck } from "../../app/use-deck-tiers";
import ShareDeckCode from "../../components/ShareDeckCode";
import AdInContent from "../../ads/AdInContent";
import SeoContent from "../../components/SeoContent";
import { useMarkContentReady } from "../../ads/ContentReadyContext";
import { useQuery } from "@tanstack/react-query";
import { CardType, fetchCards } from "../../app/cards-api";
import { countById } from "../../app/deck-diff";
import {
  CardSection,
  EmptyActions,
  EmptyMessage,
  FinderHelper,
  Or,
  Overlay,
  Shrug,
  Strength,
  StrengthFill,
  StrengthLabel,
  StrengthTrack,
  StyledDeckPage,
  StyledLink,
  UndoButton,
  MatchupUnavailable,
  WinRatePlaceholder,
} from "./deck-page.styles";

const DeckFinderPage = () => {
  const { decks, scoreBaseline, metaShareBySlug, loading, error } = useDecks();
  const { matchupsByName, loading: matchupsLoading, error: matchupsError } = useMatchups();
  const tiers = useDeckTiers(decks);
  const { undoMissing, canUndo, lastRemovedId } = useMissing();
  const { t } = useTranslation();

  // Card data for resolving a removed card's name in the empty-deck notice.
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

  const deck = decks ? sortByPowerScore(decks)[0] : undefined;

  // Ready (for showing ads) only once a real deck is resolved, never on the
  // loading or "not enough cards" screens.
  useMarkContentReady(!loading && !!decks && !!deck);

  if (loading) return <DeckPageSkeleton showPanel={false} />;
  if (error) return <Overlay>Error loading data: {error.message}</Overlay>;
  if (!decks) return <DeckPageSkeleton showPanel={false} />;

  if (!deck) {
    return (
      <Overlay>
        <Shrug>{t("deckPage.notEnoughShrug")}</Shrug>
        {lastCutName ? (
          <EmptyMessage>
            {t("deckPage.notEnoughBody", { card: lastCutName })}
          </EmptyMessage>
        ) : (
          <EmptyMessage>{t("deckPage.notEnoughCards")}</EmptyMessage>
        )}
        <EmptyActions>
          <UndoButton disabled={!canUndo} $disabled={!canUndo} onClick={undoMissing}>
            {t("deckPage.undo")}
          </UndoButton>
          <Or>{t("deckPage.or")}</Or>
          <StyledLink to="/tier-list">{t("deckPage.tryAnotherDeck")}</StyledLink>
        </EmptyActions>
      </Overlay>
    );
  }

  const relativeScore =
    typeof deck.powerScore === "number" && scoreBaseline
      ? relativeToBaseline(deck.powerScore, scoreBaseline.powerScore)
      : null;
  const uniqueCards = deck.bestList.cards.filter(
    (card, index, self) => self.findIndex((c) => c.id === card.id) === index
  );
  const cardCounts = countById(deck.bestList.cards);
  const deckMatchups = matchupsByName?.[deck.name];
  const totalMatchup = deckMatchups?.find((m) => m.name === "Total");
  const share = metaShareBySlug?.[deck.id]?.share;
  const heroStats: DeckHeroStat[] = [
    ...(matchupsLoading
      ? [{ label: t("deckPage.winRate"), value: <WinRatePlaceholder aria-hidden="true" data-testid="win-rate-placeholder" /> }]
      : totalMatchup && !matchupsError
      ? [{ label: t("deckPage.winRate"), value: `${Math.round(totalMatchup.winRate * 100)}%` }]
      : []),
    ...(share !== undefined
      ? [{ label: t("deckPage.metaShare"), value: `${(share * 100).toFixed(1)}%` }]
      : []),
    ...(deck.bestList.energyIds.length > 0
      ? [{ label: t("deckPage.energyUsed"), value: <EnergyList energyIds={deck.bestList.energyIds} /> }]
      : []),
  ];


  return (
    <>
      <DeckHeadTags deck={deck} />
      <DeckHero deck={deck} tier={tierForDeck(tiers, deck.id)} stats={heroStats}>
        {relativeScore !== null && (
          <Strength>
            <StrengthLabel>
              {t("deckPage.relativeStrength")}{" "}
              {`${(relativeScore * 100).toFixed(0)}%`}
            </StrengthLabel>
            <StrengthTrack
              role="meter"
              aria-label={t("deckPage.relativeStrength")}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(relativeScore * 100)}
            >
              <StrengthFill $value={relativeScore} />
            </StrengthTrack>
          </Strength>
        )}
      </DeckHero>
      <StyledDeckPage>
        <CardSection>
          <FinderHelper>{t("deckPage.deckFinderHeader")}</FinderHelper>
          {matchupsError && <MatchupUnavailable>{t("deckPage.matchupsUnavailable")}</MatchupUnavailable>}
          <DeckCardGrid cards={uniqueCards} counts={cardCounts} />
          <AdInContent placement="deck" />
          <ShareDeckCode
            deckName={deck.name}
            code={deck.bestList.deckCode}
            energyCount={deck.bestList.energyIds.length}
          />
        </CardSection>
      </StyledDeckPage>

      <SeoContent>
        <h2>{t("deckFinder.heading", { ns: "seo" })}</h2>
        <p>{t("deckFinder.intro", { ns: "seo" })}</p>
        <p>{t("deckFinder.body", { ns: "seo" })}</p>
      </SeoContent>
    </>
  );
};

export default DeckFinderPage;
