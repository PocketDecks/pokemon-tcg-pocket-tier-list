import styled from "styled-components";
import Button from "../../components/Button";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { useDecks } from "../../app/use-decks";
import useDeckTiers from "../../app/use-deck-tiers";
import DeckCard from "../../components/DeckCard";
import NavIcon from "../../components/NavIcon";

const PREVIEW_TIERS = 3;
const PREVIEW_DECKS = 5;

const StyledHero = styled.div`
  width: 100%;
  min-height: 80dvh;
  display: flex;
  flex-direction: column;
  padding: 4rem;

  @media (max-width: 900px) {
    padding: 2.4rem 2rem;
    min-height: 0;
  }
`;

const Content = styled.div`
  width: 100%;
  margin: auto;
  display: grid;
  grid-template-columns: minmax(0, 5fr) minmax(0, 6fr);
  align-items: center;
  gap: 6.4rem;

  @media (max-width: 1100px) {
    grid-template-columns: 1fr;
    gap: 4rem;
  }
`;

const TextSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2.8rem;
`;

const StyledHeader = styled.h1`
  font-size: 5.6rem;
  font-weight: 700;
  line-height: 1.05;
  letter-spacing: -0.03em;
  text-wrap: balance;

  @media (max-width: 1400px) { font-size: 4.8rem; }
  @media (max-width: 900px) { font-size: 3.6rem; }
`;

const StyledSubheader = styled.p`
  font-size: 1.9rem;
  line-height: 1.55;
  max-width: 56ch;
  color: rgba(255, 255, 255, 0.72);
  text-wrap: pretty;

  @media (max-width: 900px) { font-size: 1.6rem; }
`;

const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 1.2rem 2.4rem;
`;

const SecondaryLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 0.8rem;
  min-height: 4.4rem;
  font-size: 1.6rem;
  font-weight: 600;
  color: var(--main);
  text-decoration: underline;
  text-decoration-color: rgba(255, 255, 255, 0.3);
  text-underline-offset: 0.4rem;
  transition: text-decoration-color 160ms ease-out;

  &:hover {
    text-decoration-color: var(--main);
  }

  svg {
    transition: transform 200ms cubic-bezier(0.16, 1, 0.3, 1);
  }

  &:hover svg {
    transform: translateX(0.3rem);
  }
`;

const Preview = styled.section`
  display: flex;
  flex-direction: column;
  border-radius: 1.6rem;
  overflow: hidden;
  background: #121210;
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 2.4rem 4.8rem rgba(0, 0, 0, 0.35);
`;

const PreviewRow = styled.div`
  display: flex;
  height: 11.2rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);

  &:last-of-type {
    border-bottom: none;
  }

  @media (max-width: 900px) {
    height: auto;
  }
`;

const RowHeader = styled.div<{ $color: string }>`
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: 8rem;
  background: ${(props) => props.$color};
  color: rgba(0, 0, 0, 0.72);
  font-size: 3.2rem;
  font-weight: 600;

  @media (max-width: 900px) {
    width: 5.6rem;
    font-size: 2.4rem;
  }
`;

const RowDecks = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  gap: 1.6rem;
  padding: 1.4rem 1.6rem;
  overflow: hidden;

  @media (max-width: 900px) {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 1.2rem;
    padding: 1.2rem;

    & > *:nth-child(n + 4) {
      display: none;
    }
  }
`;

const SkeletonTile = styled.span`
  height: 100%;
  aspect-ratio: 1 / 1;
  border-radius: 1.2rem;
  background: rgba(255, 255, 255, 0.06);

  @media (max-width: 900px) {
    height: auto;
    width: 100%;
  }
`;

const SKELETON_TIERS = [
  { label: "S", color: "var(--s)" },
  { label: "A", color: "var(--a)" },
  { label: "B", color: "var(--b)" },
];

const Hero = () => {
  const { t } = useTranslation();
  const { decks, metaShareBySlug } = useDecks();
  const tiers = useDeckTiers(decks)
    .filter((tier) => tier.decks.length > 0)
    .slice(0, PREVIEW_TIERS);

  return (
    <StyledHero>
      <Content>
        <TextSection>
          <StyledHeader>{t("hero.title")}</StyledHeader>
          <StyledSubheader>{t("hero.subtitle")}</StyledSubheader>
          <Actions>
            <Button to="/tier-list">{t("hero.button")}</Button>
            <SecondaryLink to="/deck">
              {t("header.bestDeckFinder")}
              <NavIcon name="arrowRight" size={18} />
            </SecondaryLink>
          </Actions>
        </TextSection>
        <Preview aria-label={t("header.tierList")}>
          {tiers.length > 0
            ? tiers.map((tier) => (
                <PreviewRow key={tier.label}>
                  <RowHeader $color={tier.color}>{tier.label}</RowHeader>
                  <RowDecks>
                    {tier.decks.slice(0, PREVIEW_DECKS).map((deck) => (
                      <DeckCard
                        key={deck.id}
                        deck={deck}
                        metaShare={metaShareBySlug?.[deck.id] ?? null}
                        metaShareLabel={t("tierList.metaShare")}
                      />
                    ))}
                  </RowDecks>
                </PreviewRow>
              ))
            : SKELETON_TIERS.map((tier) => (
                <PreviewRow key={tier.label} aria-hidden="true">
                  <RowHeader $color={tier.color}>{tier.label}</RowHeader>
                  <RowDecks>
                    {Array.from({ length: PREVIEW_DECKS }, (_, index) => (
                      <SkeletonTile key={index} />
                    ))}
                  </RowDecks>
                </PreviewRow>
              ))}
        </Preview>
      </Content>
    </StyledHero>
  );
};

export default Hero;
