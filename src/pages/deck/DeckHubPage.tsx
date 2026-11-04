import styled from "styled-components";
import { Link, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useMarkContentReady } from "../../ads/ContentReadyContext";
import { archiveForHub } from "../../app/deck-archive";
import { LocaleLink, useLocaleHref } from "../../app/locale-link";
import { deckSlug } from "../../app/deck-slug";
import { hubDisplayName, hubSeenRange } from "../../app/deck-archetype";
import { deckDisplayName, variantDisplayName } from "../../app/deck-display";
import { useDecks, useMatchups } from "../../app/use-decks";
import { useHubFile } from "../../app/use-hub-file";
import { fetchCards } from "../../app/cards-api";
import { MIN_MATCHUP_GAMES } from "../../app/config";
import { newestExpansion } from "../../app/expansion-policy.mjs";
import { EXPANSIONS_URL } from "../../app/constants";
import SeoContent from "../../components/SeoContent";
import DeckHubHeadTags, { type HubHeadStatus } from "./DeckHubHeadTags";
import NotFoundPage from "../not-found/NotFoundPage";
import {
  coreCardsOf,
  hubPeak,
  mostIncluded,
  newestFirst,
  pickMatchups,
  similarDecks,
} from "./hub-content";

const Page = styled.div`
  width: 100%;
  max-width: 100rem;
  margin: 0 auto;
  padding: 4rem 2.4rem 8rem;
`;

const Header = styled.header`
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
  margin-bottom: 3.2rem;
`;

const Title = styled.h1`
  font-size: clamp(2.8rem, 5vw, 4.8rem);
  line-height: 1.1;
`;

const Summary = styled.p`
  max-width: 68ch;
  color: var(--text-muted);
  font-size: 1.7rem;
  line-height: 1.6;
`;

const History = styled.p`
  color: var(--text-muted);
  font-size: 1.4rem;
`;

const List = styled.div`
  display: grid;
  gap: 1.2rem;
`;

const Variant = styled(LocaleLink)`
  display: block;
  padding: 1.8rem 2rem;
  border: 1px solid var(--line);
  border-radius: 0.8rem;
  color: inherit;
  text-decoration: none;
  background: var(--surface);

  &:hover {
    border-color: var(--main);
  }
`;

const VariantName = styled.strong`
  display: block;
  margin-bottom: 0.6rem;
  font-size: 1.8rem;
`;

const VariantMeta = styled.span`
  color: var(--text-muted);
  font-size: 1.4rem;
`;

const Section = styled.section`
  display: grid;
  gap: 1.2rem;
  margin-top: 3.6rem;
`;

const SectionTitle = styled.h2`
  font-size: 2.2rem;
`;

const SubTitle = styled.h3`
  margin-bottom: 0.8rem;
  color: var(--text-muted);
  font-size: 1.6rem;
`;

const Columns = styled.div`
  display: grid;
  gap: 2.4rem;

  @media (min-width: 900px) {
    grid-template-columns: 1fr 1fr;
  }
`;

const CardGrid = styled.ul`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(22rem, 1fr));
  gap: 0.8rem 1.6rem;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 1.5rem;
`;

const Rows = styled.ul`
  display: grid;
  gap: 0.8rem;
  margin: 0;
  padding: 0;
  list-style: none;
`;

const Row = styled.li`
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0.6rem 1.2rem;
  padding: 1.2rem 1.6rem;
  border: 1px solid var(--line);
  border-radius: 0.8rem;
  background: var(--surface);
  font-size: 1.5rem;
`;

const Muted = styled.p`
  color: var(--text-muted);
  font-size: 1.4rem;
`;

const Actions = styled.nav`
  display: flex;
  flex-wrap: wrap;
  gap: 1.2rem;
  margin-top: 3rem;
`;

const Action = styled(Link)`
  color: var(--main);
  font-weight: 600;
`;

const dateLocale = (language: string) => (language === "en" ? "en-GB" : language);

const formatDate = (date: string, language: string) =>
  new Intl.DateTimeFormat(dateLocale(language), { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));

const percent = (value: number) => (value * 100).toFixed(1);

const shareText = (value: number) => (value > 0 && value < 0.0005 ? "<0.1" : percent(value));

const HubPage = () => {
  const { deckId: hubSlug } = useParams();
  const { decks, metaShareBySlug, loading } = useDecks();
  const { matchupsByName, loading: matchupsLoading } = useMatchups();
  const { t, i18n } = useTranslation();
  const tierListHref = useLocaleHref("/tier-list");
  const deckFinderHref = useLocaleHref("/deck");
  const variants = hubSlug ? archiveForHub(hubSlug) : [];
  const hubQuery = useHubFile(hubSlug);
  const cardsQuery = useQuery({ queryKey: ["cards"], queryFn: fetchCards });
  const hub = hubQuery.data;
  const cardNames = useMemo(
    () => new Map((cardsQuery.data?.cards ?? []).map((card) => [card.id, card.name])),
    [cardsQuery.data]
  );
  const liveBySlug = new Map((decks ?? []).map((deck) => [deckSlug(deck.name), deck]));
  const deckByName = new Map((decks ?? []).map((deck) => [deck.name, deck]));
  const liveNames = new Set((decks ?? []).map((deck) => deck.name));
  const powerOf = (variant: string) => liveBySlug.get(variant)?.powerScore ?? -1;
  const liveVariants = variants
    .filter((entry) => liveBySlug.has(entry.variant))
    .sort((a, b) => powerOf(b.variant) - powerOf(a.variant));
  const latest = newestExpansion(EXPANSIONS_URL);
  const contentReady =
    variants.length === 0 || (hub !== undefined && cardsQuery.isSuccess && !matchupsLoading);
  useMarkContentReady(!loading && contentReady);

  if (!hubSlug || variants.length === 0) return <NotFoundPage />;

  const name = hubDisplayName(variants);
  const seen = hubSeenRange(variants);
  const headStatus: HubHeadStatus =
    loading || decks === null ? "unknown" : liveVariants.length > 0 ? "live" : "retired";
  const records = hub?.variants ?? [];
  const recordSeen = hubSeenRange(records.length > 0 ? records : variants);
  const strongest = liveVariants[0];
  const strongestDeck = strongest ? liveBySlug.get(strongest.variant) : undefined;
  const strongestShare = strongest ? metaShareBySlug?.[strongest.variant]?.share : undefined;
  const coreRecord = strongest
    ? records.find((record) => record.variant === strongest.variant)
    : newestFirst(records).find((record) => record.cards.length > 0);
  const coreCards = coreCardsOf(coreRecord?.cards ?? []);
  const namedCore = coreCards.flatMap((card) => {
    const cardName = cardNames.get(card.id);
    return cardName ? [{ ...card, name: cardName }] : [];
  });
  const coreIds = new Set(coreCards.map((card) => card.id));
  const matchups = strongestDeck
    ? pickMatchups(matchupsByName?.[strongestDeck.name], strongestDeck.name, liveNames, MIN_MATCHUP_GAMES, 3)
    : { best: [], worst: [] };
  const similar = similarDecks(decks ?? [], coreIds, hubSlug, 3);
  const peak = hubPeak(records);
  const topCards = mostIncluded(namedCore, 3).map((card) => card.name);
  const expansionName = latest?.name ?? t("deckHub.expansionFallback");
  const status = strongestDeck
    ? strongestShare === undefined
      ? t("hub.liveStatusNoShare", {
          ns: "seo",
          winRate: percent(strongestDeck.expectedWinRate),
        })
      : t("hub.liveStatus", {
          ns: "seo",
          winRate: percent(strongestDeck.expectedWinRate),
          metaShare: shareText(strongestShare),
        })
    : t("hub.retiredStatus", {
        ns: "seo",
        name,
        lastSeen: formatDate(recordSeen.lastSeen, i18n.language),
        expansion: expansionName,
      });
  const overview =
    peak === null
      ? null
      : t("hub.overview", {
          ns: "seo",
          count: records.length,
          name,
          firstSeen: formatDate(recordSeen.firstSeen, i18n.language),
          peakShare: shareText(peak.share),
          peakDate: formatDate(peak.date, i18n.language),
        });
  const coreSentence =
    topCards.length === 0
      ? null
      : t("hub.coreCards", {
          ns: "seo",
          cards: new Intl.ListFormat(i18n.language, { style: "long", type: "conjunction" }).format(topCards),
        });

  const renderMatchups = (list: { name: string; winRate: number }[]) =>
    list.map((matchup) => (
      <Row key={matchup.name}>
        <span>{variantDisplayName(matchup.name, deckByName.get(matchup.name))}</span>
        <span>{t("deckHub.winRate", { value: percent(matchup.winRate) })}</span>
      </Row>
    ));

  return (
    <Page>
      <DeckHubHeadTags name={name} status={headStatus} />
      <Header>
        <Title>{t("deckHub.title", { name })}</Title>
        {loading ? null : !decks ? (
          <Summary>{t("deckHub.unavailable")}</Summary>
        ) : liveVariants.length > 0 ? (
          <Summary>{t("deckHub.liveSummary", { count: liveVariants.length })}</Summary>
        ) : (
          <Summary>
            {t("deckHub.notInMeta", { expansion: expansionName })}
          </Summary>
        )}
        <History>
          {t("deckHub.seenFrom", {
            from: formatDate(seen.firstSeen, i18n.language),
            to: formatDate(seen.lastSeen, i18n.language),
          })}
        </History>
      </Header>
      {liveVariants.length > 0 && (
        <List>
          {liveVariants.map((entry) => {
            const deck = liveBySlug.get(entry.variant);
            const share = metaShareBySlug?.[entry.variant]?.share;
            return (
              <Variant key={entry.variant} to={`/deck/${entry.variant}`}>
                <VariantName>{variantDisplayName(entry.name, deck)}</VariantName>
                <VariantMeta>
                  {[
                    deck ? t("deckHub.winRate", { value: (deck.expectedWinRate * 100).toFixed(1) }) : null,
                    share === undefined ? null : t("deckHub.metaShare", { value: shareText(share) }),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </VariantMeta>
              </Variant>
            );
          })}
        </List>
      )}
      {hub && (
        <>
          <Section>
            <SectionTitle>{t("deckHub.coreCards")}</SectionTitle>
            {namedCore.length === 0 ? (
              <Muted>{t("deckHub.noCoreCards")}</Muted>
            ) : (
              <CardGrid>
                {namedCore.map((card) => (
                  <li key={card.id}>{t("deckHub.cardLine", { count: card.count, name: card.name })}</li>
                ))}
              </CardGrid>
            )}
          </Section>
          {strongestDeck && (
            <Section>
              <SectionTitle>{t("deckHub.matchups")}</SectionTitle>
              {matchups.best.length + matchups.worst.length === 0 ? (
                <Muted>{t("deckHub.noMatchups")}</Muted>
              ) : (
                <Columns>
                  <div>
                    <SubTitle>{t("deckHub.bestMatchups")}</SubTitle>
                    <Rows>{renderMatchups(matchups.best)}</Rows>
                  </div>
                  <div>
                    <SubTitle>{t("deckHub.worstMatchups")}</SubTitle>
                    <Rows>{renderMatchups(matchups.worst)}</Rows>
                  </div>
                </Columns>
              )}
            </Section>
          )}
          <Section>
            <SectionTitle>{t("deckHub.similarDecks")}</SectionTitle>
            {similar.length === 0 ? (
              <Muted>{t("deckHub.noSimilarDecks")}</Muted>
            ) : (
              <Rows>
                {similar.map(({ deck, shared }) => (
                  <li key={deck.name}>
                    <Variant to={`/deck/${deckSlug(deck.name)}`}>
                      <VariantName>{deckDisplayName(deck)}</VariantName>
                      <VariantMeta>{t("deckHub.sharedCards", { count: shared })}</VariantMeta>
                    </Variant>
                  </li>
                ))}
              </Rows>
            )}
          </Section>
          <Section>
            <SectionTitle>{t("deckHub.variantHistory")}</SectionTitle>
            <Rows>
              {newestFirst(records).map((record) => {
                const deck = liveBySlug.get(record.variant);
                const label = variantDisplayName(record.name, deck);
                const seenText = t("deckHub.seenFrom", {
                  from: formatDate(record.firstSeen, i18n.language),
                  to: formatDate(record.lastSeen, i18n.language),
                });
                const peakText =
                  record.peakShare === null || record.peakDate === null
                    ? null
                    : t("deckHub.peakShare", {
                        value: shareText(record.peakShare),
                        date: formatDate(record.peakDate, i18n.language),
                      });
                const historyLine = [seenText, peakText].filter(Boolean).join(" · ");
                return deck ? (
                  <li key={record.variant}>
                    <Variant to={`/deck/${record.variant}`}>
                      <VariantName>{label}</VariantName>
                      <VariantMeta>{historyLine}</VariantMeta>
                    </Variant>
                  </li>
                ) : (
                  <Row key={record.variant}>
                    <strong>{label}</strong>
                    <span>{historyLine}</span>
                  </Row>
                );
              })}
            </Rows>
          </Section>
        </>
      )}
      <Actions>
        <Action to={tierListHref}>{t("notFound.backToTierList")}</Action>
        {liveVariants.length === 0 && <Action to={deckFinderHref}>{t("notFound.browseDecks")}</Action>}
      </Actions>
      {hub && (
        <SeoContent>
          <h2>{t("hub.heading", { ns: "seo", name })}</h2>
          {overview !== null && <p>{overview}</p>}
          <p>{status}</p>
          {coreSentence !== null && <p>{coreSentence}</p>}
        </SeoContent>
      )}
    </Page>
  );
};

export default HubPage;
