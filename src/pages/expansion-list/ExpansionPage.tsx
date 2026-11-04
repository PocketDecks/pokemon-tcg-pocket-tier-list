import styled from "styled-components";
import { useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useMarkContentReady } from "../../ads/ContentReadyContext";
import { useDecks } from "../../app/use-decks";
import useExpansions from "../../app/use-expansions";
import { fetchCards } from "../../app/cards-api";
import { expansionPageData } from "../../app/expansion-page-data";
import { cardThumbUrl, onDeckThumbError } from "../../app/deck-thumb";
import { deckDisplayName } from "../../app/deck-display";
import { LocaleLink } from "../../app/locale-link";
import { isListedExpansion } from "../../app/expansion-policy.mjs";
import { cardHubFor } from "../../app/card-hub";
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
const BackLink = styled(Meta)`
  margin-top: 4rem;
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
  border-radius: 0.6rem;
  transition: box-shadow 150ms ease-out;
`;
const CardLink = styled(LocaleLink)`
  display: grid;
  gap: 0.8rem;
  min-width: 0;
  color: inherit;
  text-decoration: none;
  border-radius: 0.6rem;

  &:hover ${CardImage},
  &:focus-visible ${CardImage} {
    box-shadow: 0 0 0 2px var(--focus), 0 0 1.6rem var(--accent-shadow);
  }
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
const EmptyState = styled.div`
  display: grid;
  justify-items: start;
  gap: 1.2rem;
  margin-top: 3.6rem;
`;
const Shrug = styled.span`
  color: var(--text-muted);
  font-size: 4rem;
  line-height: 1;
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
  const expansion = expansions?.find((entry) => entry.id === expansionId);
  const allCardsQuery = useQuery({ queryKey: ["cards"], queryFn: fetchCards });
  const rawCards = allCardsQuery.data?.cards ?? [];
  const data = expansion && rawCards.length > 0 && decks
    ? expansionPageData(expansion, rawCards, decks, deckDisplayName)
    : null;
  useMarkContentReady(!decksLoading && !!expansions && rawCards.length > 0);

  if (!expansion || !isListedExpansion(expansion)) return <NotFoundPage />;
  const locale = i18n.language === "en" ? "en-GB" : i18n.language;
  const releaseDate = expansion.release_date
    ? new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${expansion.release_date}T00:00:00Z`))
    : null;

  return (
    <Page>
      <Header>
        <Breadcrumbs aria-label="Breadcrumb">
          <LocaleLink to="/">{t("expansionPage.home")}</LocaleLink>
          <BreadcrumbSeparator aria-hidden="true">&gt;</BreadcrumbSeparator>
          <LocaleLink to="/expansion-list">{t("expansionPage.expansions")}</LocaleLink>
          <BreadcrumbSeparator aria-hidden="true">&gt;</BreadcrumbSeparator>
          <span>{expansion.id.toUpperCase()}</span>
        </Breadcrumbs>
        <Title>{t("expansionPage.heading", { name: expansion.name, id: expansion.id.toUpperCase() })}</Title>
        {releaseDate && <Meta>{t("expansionPage.released", { date: releaseDate })}</Meta>}
        {!(data && data.cards.length === 0) && <Meta>{t("expansionPage.intro", { name: expansion.name })}</Meta>}
      </Header>
      {data && data.cards.length === 0 ? (
        <EmptyState>
          <Shrug aria-hidden="true">{"¯\\_(ツ)_/¯"}</Shrug>
          <Meta>{t("expansionPage.empty", { name: expansion.name })}</Meta>
        </EmptyState>
      ) : (
        <>
          <Section>
            <SectionTitle>{t("expansionPage.cardsHeading")}</SectionTitle>
            {data && (
              <CardGrid>
                {data.cards.map((card) => {
                  const hub = cardHubFor(card);
                  const image = (
                    <CardImage
                      src={cardThumbUrl(card.id, 240)}
                      width={240}
                      height={335}
                      alt={card.name}
                      loading="lazy"
                      onError={onDeckThumbError(card.image)}
                    />
                  );
                  const name = <CardName>{card.name}</CardName>;
                  return (
                    <CardItem key={card.id}>
                      {hub ? (
                        <CardLink to={`/deck/${hub}`} aria-label={card.name}>
                          {image}
                          {name}
                        </CardLink>
                      ) : (
                        <>
                          {image}
                          {name}
                        </>
                      )}
                    </CardItem>
                  );
                })}
              </CardGrid>
            )}
          </Section>
          <Section>
            <SectionTitle>{t("expansionPage.decksHeading")}</SectionTitle>
            {data &&
              (data.decks.length ? (
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
                <Empty>{t("expansionPage.noDecks")}</Empty>
              ))}
          </Section>
        </>
      )}
      <BackLink><LocaleLink to="/tier-list">{t("notFound.backToTierList")}</LocaleLink></BackLink>
    </Page>
  );
};

export default ExpansionPage;
