import styled from "styled-components";
import { useTranslation } from "react-i18next";
import { useDecks } from "../../app/use-decks";
import { rankDeckTiers } from "../../app/use-deck-tiers";
import { deckDisplayName } from "../../app/deck-display";
import { LocaleLink } from "../../app/locale-link";
import { latestExpansion } from "../../app/use-expansions";

const TOP_COUNT = 10;

const Section = styled.section`
  width: 100%;
  max-width: 150rem;
  padding: 6.4rem 4rem;
  border-top: 1px solid var(--fill-hover);
  display: flex;
  flex-direction: column;
  gap: 2rem;

  @media (max-width: 900px) {
    padding: 4.8rem 2rem;
  }
`;

const Title = styled.h2`
  font-size: 3.6rem;
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -0.02em;
`;

const List = styled.ol`
  display: grid;
  gap: 0.8rem;
  margin: 0;
  padding: 0;
  list-style: none;
`;

const Item = styled.li`
  display: grid;
  grid-template-columns: 3.6rem minmax(0, 1fr) auto;
  align-items: center;
  gap: 1.4rem;
  padding: 1.2rem 1.6rem;
  border: 1px solid var(--line);
  border-radius: 0.8rem;
  background: var(--surface);
  font-size: 1.6rem;
`;

const Tier = styled.span`
  font-weight: 700;
  color: var(--main);
`;

const DeckLink = styled(LocaleLink)`
  color: var(--main);
  font-weight: 600;
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
`;

const WinRate = styled.span`
  color: var(--text-muted);
  font-size: 1.4rem;
  font-variant-numeric: tabular-nums;
`;

const FullList = styled(LocaleLink)`
  align-self: flex-start;
  color: var(--main);
  font-weight: 600;
`;

const TopDecks = () => {
  const { t } = useTranslation();
  const { decks } = useDecks();
  const ranked = rankDeckTiers(decks).flatMap((tier) =>
    [...tier.decks]
      .sort((a, b) => (b.powerScore ?? -1) - (a.powerScore ?? -1))
      .map((deck) => ({ tier: tier.label, deck }))
  );
  const top = ranked.slice(0, TOP_COUNT);
  if (top.length === 0) return null;
  const newest = latestExpansion();

  return (
    <Section>
      <Title>
        {newest
          ? t("landing.topDecks.title", { name: newest.name })
          : t("landing.topDecks.fallbackTitle")}
      </Title>
      <List>
        {top.map(({ tier, deck }) => (
          <Item key={deck.id}>
            <Tier>{tier}</Tier>
            <DeckLink to={`/deck/${deck.id}`}>{deckDisplayName(deck)}</DeckLink>
            <WinRate>
              {t("landing.topDecks.winRate", { value: (deck.expectedWinRate * 100).toFixed(1) })}
            </WinRate>
          </Item>
        ))}
      </List>
      <FullList to="/tier-list/">{t("landing.topDecks.fullList")}</FullList>
    </Section>
  );
};

export default TopDecks;
