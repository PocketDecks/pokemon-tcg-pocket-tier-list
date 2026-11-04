import styled from "styled-components";
import { useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useMarkContentReady } from "../../ads/ContentReadyContext";
import { useDecks } from "../../app/use-decks";
import useExpansions from "../../app/use-expansions";
import { fetchCards } from "../../app/cards-api";
import { EXPANSIONS_URL } from "../../app/constants";
import { expansionPageData } from "../../app/expansion-page-data";
import { cardThumbUrl, onDeckThumbError } from "../../app/deck-thumb";
import { deckDisplayName } from "../../app/deck-display";
import { expansionIndexPolicy } from "../../app/expansion-index-policy";
import { useLocaleHref } from "../../app/locale-link";
import { deckArchetypeSlug } from "../../app/deck-archetype";
import DeckCard from "../../components/DeckCard";
import NotFoundPage from "../not-found/NotFoundPage";

const Page = styled.main`
  width: 100%;
  max-width: 110rem;
  margin: 0 auto;
  padding: 4rem 2.4rem 8rem;
`;
const Header = styled.header`
  display: grid;
  gap: 1rem;
  margin-bottom: 3.2rem;
`;
const Title = styled.h1`
  font-size: clamp(2.8rem, 5vw, 4.8rem);
  line-height: 1.1;
`;
const Meta = styled.p`
  color: var(--text-muted);
  font-size: 1.6rem;
`;
const Section = styled.section`
  display: grid;
  gap: 1.6rem;
  margin-top: 3.6rem;
`;
const SectionTitle = styled.h2`
  font-size: 2.4rem;
`;
const CardGrid = styled.ul`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 2.4rem 1.6rem;
  margin: 0;
  padding: 0;
  list-style: none;

  @media (min-width: 900px) {
    grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
  }
`;
const CardItem = styled.li`
  display: grid;
  gap: 0.8rem;
  min-width: 0;
`;
const CardImage = styled.img`
  display: block;
  width: 100%;
  height: auto;
`;
const CardName = styled.span`
  color: var(--text-muted);
  font-size: 1.4rem;
`;
const DeckList = styled.ul`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 2.4rem;
  margin: 0;
  padding: 0;
  list-style: none;

  @media (min-width: 900px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;
const DeckRow = styled.li`
  display: flex;
  align-items: center;
  gap: 1.6rem;
  min-width: 0;
`;
const DeckSlot = styled.div`
  position: relative;
  flex: 0 0 auto;
  box-sizing: border-box;
  width: 7rem;
  height: 7rem;
  padding: 0 1.2rem 1.2rem 0;

  @media (min-width: 900px) {
    width: 8rem;
    height: 8rem;
  }
`;
const DeckName = styled.span`
  font-size: 1.6rem;
  font-weight: 600;
`;
const Empty = styled.p`
  color: var(--text-muted);
`;
const Breadcrumbs = styled.nav`
  font-size: 1.4rem;
  color: var(--text-muted);
`;
const BreadcrumbSeparator = styled.span`
  margin: 0 0.6rem;
`;

const ExpansionPage = () => {
  const { expansionId } = useParams();
  const { decks, metaShareBySlug, loading: decksLoading } = useDecks();
  const expansions = useExpansions();
  const { t, i18n } = useTranslation();
  const tierListHref = useLocaleHref("/tier-list");
  const homeHref = useLocaleHref("/");
  const expansionsHref = useLocaleHref("/expansion-list");
  const expansion = expansions?.find((entry) => entry.id === expansionId);
  const allCardsQuery = useQuery({ queryKey: ["cards"], queryFn: fetchCards });
  const rawCards = allCardsQuery.data?.cards ?? [];
  const coveredIds = new Set(
    (decks ?? []).flatMap((deck) =>
      deck.lists.flatMap((list) => list.cards.map((card) => card.set))
    )
  );
  const policy = expansionIndexPolicy(EXPANSIONS_URL, coveredIds);
  const data = expansion && rawCards.length > 0 && decks
    ? expansionPageData(expansion, rawCards, decks, deckDisplayName)
    : null;
  useMarkContentReady(!decksLoading && !!expansions && rawCards.length > 0);

  if (!expansion) return <NotFoundPage />;
  const locale = i18n.language === "en" ? "en-GB" : i18n.language;
  const releaseDate = expansion.release_date
    ? new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${expansion.release_date}T00:00:00Z`))
    : t("expansionPage.unknownDate");
  const title = `Pokemon TCG Pocket ${expansion.name} (${expansion.id.toUpperCase()}): Best Cards & Decks`;

  return (
    <Page>
      <Header>
        <Breadcrumbs aria-label="Breadcrumb">
          <a href={homeHref}>{t("expansionPage.home")}</a>
          <BreadcrumbSeparator aria-hidden="true">&gt;</BreadcrumbSeparator>
          <a href={expansionsHref}>{t("expansionPage.expansions")}</a>
          <BreadcrumbSeparator aria-hidden="true">&gt;</BreadcrumbSeparator>
          <span>{expansion.id.toUpperCase()}</span>
        </Breadcrumbs>
        <Title>{title}</Title>
        <Meta>{expansion.name} ({expansion.id.toUpperCase()}) · {releaseDate}</Meta>
        <Meta>{policy.isIndexable(expansion.id) ? t("expansionPage.current") : t("expansionPage.archive")}</Meta>
        <Meta>{t("expansionPage.summary", { name: expansion.name, id: expansion.id.toUpperCase() })}</Meta>
      </Header>
      <Section>
        <SectionTitle>{t("expansionPage.cardsHeading")}</SectionTitle>
        {data?.cards.length ? (
          <CardGrid>
            {data.cards.map((card) => (
              <CardItem key={card.id}>
                <CardImage
                  src={cardThumbUrl(card.id, 240)}
                  width={240}
                  height={335}
                  alt={card.name}
                  loading="lazy"
                  onError={onDeckThumbError(card.image)}
                />
                <CardName>{card.name}</CardName>
              </CardItem>
            ))}
          </CardGrid>
        ) : (
          <>
            <Empty>{t("expansionPage.noCards")}</Empty>
            <Meta>{t("expansionPage.cardsEmptyDetail", { name: expansion.name })}</Meta>
          </>
        )}
      </Section>
      <Section>
        <SectionTitle>{t("expansionPage.decksHeading")}</SectionTitle>
        {data?.decks.length ? (
          <DeckList>
            {data.decks.map(({ deck, displayName: name }) => (
              <DeckRow key={deck.name}>
                <DeckSlot>
                  <DeckCard deck={deck} linkTo={`/deck/${deckArchetypeSlug(deck.name)}`} metaShare={metaShareBySlug?.[deck.name] ?? null} />
                </DeckSlot>
                <DeckName>{name}</DeckName>
              </DeckRow>
            ))}
          </DeckList>
        ) : (
          <>
            <Empty>{t("expansionPage.noDecks")}</Empty>
            <Meta>{t("expansionPage.decksEmptyDetail", { name: expansion.name })}</Meta>
          </>
        )}
      </Section>
      <Meta><a href={tierListHref}>{t("notFound.backToTierList")}</a></Meta>
    </Page>
  );
};

export default ExpansionPage;
