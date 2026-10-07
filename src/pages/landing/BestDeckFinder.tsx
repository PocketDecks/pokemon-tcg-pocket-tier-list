import styled from "styled-components";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import Button from "../../components/Button";
import { useDecks } from "../../app/use-decks";
import { sortByPowerScore } from "../../app/score-baseline";
import { deckDisplayName } from "../../app/deck-display";

const PREVIEW_CARDS = 8;

const StyledBestDeckFinder = styled.section`
  width: 100%;
  max-width: 150rem;
  padding: 8rem 4rem 10rem;
  border-top: 1px solid rgba(255, 255, 255, 0.06);

  @media (max-width: 900px) {
    padding: 5.6rem 2rem 6.4rem;
  }
`;

const Content = styled.div`
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
  align-items: flex-start;
  gap: 2.4rem;
`;

const Title = styled.h2`
  font-size: 4.8rem;
  font-weight: 700;
  line-height: 1.05;
  letter-spacing: -0.03em;

  @media (max-width: 900px) {
    font-size: 3.6rem;
  }
`;

const Description = styled.p`
  max-width: 56ch;
  font-size: 1.7rem;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.72);
  text-wrap: pretty;

  @media (max-width: 900px) {
    font-size: 1.6rem;
  }
`;

const Preview = styled(Link)`
  display: flex;
  flex-direction: column;
  gap: 1.6rem;
  padding: 2rem;
  border-radius: 1.6rem;
  background: #121210;
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 2.4rem 4.8rem rgba(0, 0, 0, 0.35);
  color: var(--main);
  transition: border-color 200ms ease-out;

  &:hover {
    border-color: rgba(255, 255, 255, 0.24);
  }
`;

const PreviewName = styled.span`
  font-size: 1.8rem;
  font-weight: 600;
  letter-spacing: -0.01em;
`;

const CardGrid = styled.span`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1.2rem;
`;

const CardImage = styled.img`
  width: 100%;
  aspect-ratio: 367 / 512;
  border-radius: 0.8rem;
  object-fit: cover;
  background: rgba(255, 255, 255, 0.06);
`;

const BestDeckFinder = () => {
  const { t } = useTranslation();
  const { decks } = useDecks();
  const topDeck = decks ? sortByPowerScore(decks)[0] : undefined;
  const previewCards = topDeck
    ? topDeck.bestList.cards
        .filter((card, index, self) => self.findIndex((c) => c.id === card.id) === index)
        .slice(0, PREVIEW_CARDS)
    : [];

  return (
    <StyledBestDeckFinder>
      <Content>
        <TextSection>
          <Title>{t("bestDeckFinder.title")}</Title>
          <Description>{t("bestDeckFinder.description1")}</Description>
          <Description>{t("bestDeckFinder.description2")}</Description>
          <Button to="/deck">{t("bestDeckFinder.button")}</Button>
        </TextSection>
        {topDeck && (
          <Preview to="/deck">
            <PreviewName>{deckDisplayName(topDeck)}</PreviewName>
            <CardGrid>
              {previewCards.map((card) => (
                <CardImage key={card.id} src={card.image} alt="" loading="lazy" />
              ))}
            </CardGrid>
          </Preview>
        )}
      </Content>
    </StyledBestDeckFinder>
  );
};

export default BestDeckFinder;
