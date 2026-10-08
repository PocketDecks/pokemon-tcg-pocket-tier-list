import styled from "styled-components";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import Button from "../../components/Button";
import DeckArt from "../../components/DeckArt";
import NavIcon from "../../components/NavIcon";
import { useDecks } from "../../app/use-decks";
import { deckDisplayName, formatArchetypeId } from "../../app/deck-display";

const PREVIEW_ROWS = 4;

const StyledStatsPreview = styled.section`
  width: 100%;
  max-width: 150rem;
  padding: 8rem 4rem;
  border-top: 1px solid rgba(255, 255, 255, 0.06);

  @media (max-width: 900px) {
    padding: 5.6rem 2rem;
  }
`;

const Content = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 6fr) minmax(0, 5fr);
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

  @media (min-width: 1101px) {
    order: 2;
  }
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
  max-width: 52ch;
  font-size: 1.7rem;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.72);
  text-wrap: pretty;

  @media (max-width: 900px) {
    font-size: 1.6rem;
  }
`;

const Panel = styled(Link)`
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
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

const PanelTitle = styled.span`
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 0.8rem;
  font-size: 1.6rem;
  font-weight: 600;

  &::before {
    content: "";
    width: 1.2rem;
    height: 1.2rem;
    border-radius: 0.3rem;
    background: var(--d);
  }
`;

const Row = styled.span`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 1.4rem;
  padding: 1rem 0;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  font-size: 1.5rem;
  font-variant-numeric: tabular-nums;
`;

const Name = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
`;

const Share = styled.span`
  color: rgba(255, 255, 255, 0.72);
`;

const Delta = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  min-width: 8rem;
  justify-content: flex-end;
  color: var(--f);
  font-weight: 600;
`;

const StatsPreview = () => {
  const { t } = useTranslation();
  const { decks, metaShare } = useDecks();

  const rankedIds = new Set(
    (decks ?? []).filter((deck) => deck.powerScore !== null).map((deck) => deck.id)
  );
  const rising = (metaShare?.decks ?? [])
    .filter((entry) => entry.delta > 0.001 && rankedIds.has(entry.name))
    .sort((a, b) => b.delta - a.delta)
    .slice(0, PREVIEW_ROWS);

  return (
    <StyledStatsPreview>
      <Content>
        <TextSection>
          <Title>{t("landing.stats.title")}</Title>
          <Description>{t("landing.stats.description")}</Description>
          <Button to="/statistics">{t("landing.stats.button")}</Button>
        </TextSection>
        {rising.length > 0 && (
          <Panel to="/statistics">
            <PanelTitle>{t("statistics.rising")}</PanelTitle>
            {rising.map((entry) => {
              const deck = decks?.find((d) => d.id === entry.name);
              return (
                <Row key={entry.name}>
                  <DeckArt size={3.2} src={deck?.iconPrimary?.image} />
                  <Name>{deck ? deckDisplayName(deck) : formatArchetypeId(entry.name)}</Name>
                  <Share>{(entry.share * 100).toFixed(1)}%</Share>
                  <Delta>
                    <NavIcon name="arrowUp" size={14} />
                    {`+${(entry.delta * 100).toFixed(1)} pp`}
                  </Delta>
                </Row>
              );
            })}
          </Panel>
        )}
      </Content>
    </StyledStatsPreview>
  );
};

export default StatsPreview;
