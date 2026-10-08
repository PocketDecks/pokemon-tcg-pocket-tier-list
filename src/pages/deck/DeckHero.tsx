import styled from "styled-components";
import type { ReactNode } from "react";
import { deckDisplayName, type NamedDeck } from "../../app/deck-display";
import DeckArt from "../../components/DeckArt";

const Hero = styled.div`
  width: 100%;
  display: flex;
  align-items: center;
  gap: 2.4rem;
  padding: 3.2rem 3rem 0;

  @media (max-width: 900px) {
    align-items: flex-start;
    gap: 1.6rem;
    padding: 2rem 2.4rem 0;
  }
`;

const ArtStack = styled.div`
  display: flex;
  flex-shrink: 0;

  & > * {
    border-radius: 1.4rem;
  }

  & > * + * {
    margin-left: -2.4rem;
    box-shadow: 0 0 0 3px var(--bg);
  }

  @media (max-width: 900px) {
    & > span {
      width: 5.6rem;
      height: 5.6rem;
    }

    & > * + * {
      margin-left: -1.6rem;
    }
  }
`;

const Body = styled.div`
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1.4rem;
`;

const Title = styled.h1`
  font-size: 4rem;
  font-weight: 600;
  line-height: 1.1;
  letter-spacing: -0.02em;
  text-wrap: balance;

  @media (max-width: 900px) {
    font-size: 2.6rem;
  }
`;

const Meta = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 1.2rem 2.8rem;
`;

const TierChip = styled.span<{ $color: string }>`
  display: inline-grid;
  place-items: center;
  width: 4rem;
  height: 4rem;
  border-radius: 1rem;
  background: ${(props) => props.$color};
  color: var(--black-78);
  font-size: 2.2rem;
  font-weight: 700;
`;

const Stat = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
`;

const StatValue = styled.div`
  font-size: 2.2rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
`;

const StatLabel = styled.span`
  font-size: 1.2rem;
  font-weight: 500;
  color: var(--white-60);
`;

export interface DeckHeroStat {
  label: string;
  value: ReactNode;
}

interface Props {
  deck: NamedDeck;
  tier: { label: string; color: string } | null;
  stats: DeckHeroStat[];
  children?: ReactNode;
}

const DeckHero = ({ deck, tier, stats, children }: Props) => (
  <Hero>
    <ArtStack aria-hidden="true">
      <DeckArt size={7.2} src={deck.iconPrimary?.image} />
      {deck.iconSecondary && <DeckArt size={7.2} src={deck.iconSecondary.image} />}
    </ArtStack>
    <Body>
      <Title>{deckDisplayName(deck)}</Title>
      <Meta>
        {tier && (
          <TierChip $color={tier.color} title={`${tier.label} tier`}>
            {tier.label}
          </TierChip>
        )}
        {stats.map((stat) => (
          <Stat key={stat.label}>
            <StatLabel>{stat.label}</StatLabel>
            <StatValue>{stat.value}</StatValue>
          </Stat>
        ))}
        {children}
      </Meta>
    </Body>
  </Hero>
);

export default DeckHero;
