import { useTranslation } from "react-i18next";
import { useDecks, useMatchups } from "../../app/use-decks";
import useMissing from "../../app/use-missing";
import {
  relativeToBaseline,
  sortByPowerScore,
} from "../../app/score-baseline";
import DeckCardGrid from "./DeckCardGrid";
import DeckHero from "./DeckHero";
import DeckEmptyState from "./DeckEmptyState";
import { buildHeroStats } from "./hero-stats";
import { uniqueCardsById } from "../../app/unique-cards";
import DeckPageSkeleton from "./DeckPageSkeleton";
import useDeckTiers, { tierForDeck } from "../../app/use-deck-tiers";
import ShareDeckCode from "../../components/ShareDeckCode";
import PageTitle from "../../components/PageTitle";
import AdInContent from "../../ads/AdInContent";
import SeoContent from "../../components/SeoContent";
import { useMarkContentReady } from "../../ads/ContentReadyContext";
import { CARDS_BY_ID } from "../../app/cards-api";
import { countById } from "../../app/deck-diff";
import {
  CardSection,
  FinderHelper,
  Overlay,
  Strength,
  StrengthFill,
  StrengthLabel,
  StrengthTrack,
  StyledDeckPage,
  MatchupUnavailable,
} from "./deck-page.styles";

const DeckFinderPage = () => {
  const decksState = useDecks();
  const { decks, scoreBaseline, metaShareBySlug } = decksState;
  const { matchupsByName, loading: matchupsLoading, error: matchupsError } = useMatchups();
  const tiers = useDeckTiers(decks);
  const { undoMissing, canUndo, lastRemovedId } = useMissing();
  const { t } = useTranslation();

  const lastCutName = lastRemovedId
    ? (CARDS_BY_ID.get(lastRemovedId)?.name ?? null)
    : null;

  const deck = decks ? sortByPowerScore(decks)[0] : undefined;

  // Ready (for showing ads) only once a real deck is resolved, never on the
  // loading or "not enough cards" screens.
  useMarkContentReady(!!deck);

  if (decksState.status === "loading") return <DeckPageSkeleton showPanel={false} />;
  if (decksState.status === "error") return <Overlay>{t("common.loadError", { message: decksState.error.message })}</Overlay>;

  if (!deck) {
    return (
      <DeckEmptyState
        shrug={t("deckPage.notEnoughShrug")}
        message={
          lastCutName
            ? t("deckPage.notEnoughBody", { card: lastCutName })
            : t("deckPage.notEnoughCards")
        }
        onUndo={undoMissing}
        undoDisabled={!canUndo}
      />
    );
  }

  const relativeScore =
    typeof deck.powerScore === "number" && scoreBaseline
      ? relativeToBaseline(deck.powerScore, scoreBaseline.powerScore)
      : null;
  const uniqueCards = uniqueCardsById(deck.bestList.cards);
  const cardCounts = countById(deck.bestList.cards);
  const deckMatchups = matchupsByName?.[deck.name];
  const totalMatchup = deckMatchups?.find((m) => m.name === "Total");
  const share = metaShareBySlug?.[deck.id]?.share;
  const heroStats = buildHeroStats({
    t,
    winRatePct: matchupsLoading
      ? "loading"
      : totalMatchup && !matchupsError
        ? Math.round(totalMatchup.winRate * 100)
        : null,
    metaShare: share,
    energyIds: deck.bestList.energyIds,
  });

  return (
    <>
      <PageTitle>{t("header.deckFinderHeading")}</PageTitle>
      <DeckHero deck={deck} tier={tierForDeck(tiers, deck.id)} stats={heroStats} titleAs="h2">
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
