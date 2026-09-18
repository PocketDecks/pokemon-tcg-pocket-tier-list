import styled from "styled-components";
import { Link } from "react-router";
import { FullDeckType } from "../contexts/DecksContext";
import { MetaShareEntry } from "../types/pipeline-data";
import { deltaTrend, DeltaTrend } from "../app/delta-trend";

const Container = styled.div`
  position: relative;
  height: 100%;

  @media (max-width: 900px) {
    height: auto;
    width: 100%;
    aspect-ratio: 1 / 1;
  }
`;

const StyledDeckCard = styled(Link)`
  position: relative;
  border-radius: 1.2rem;
  color: var(--bg);
  display: flex;
  height: 100%;
  aspect-ratio: 1 / 1;
  overflow: hidden;
  cursor: pointer;
`;

const SubCard = styled(Link)`
  position: absolute;
  bottom: -1rem;
  right: -1rem;
  border-radius: 0.6rem;
  color: var(--bg);
  height: 50%;
  aspect-ratio: 1 / 1;
  overflow: hidden;
  border: solid 1px rgba(0, 0, 0, 0.7);
  box-shadow: 0 0 0.5rem rgba(0, 0, 0, 0.7);
`;

const DeckImage = styled.img`
  position: absolute;
  top: -32%;
  left: 50%;
  transform: translateX(-50%);
  height: 280%;
`;

const ShareBadge = styled.div<{ $trend: DeltaTrend }>`
  font-size: 1.4rem;
  font-weight: 700;
  position: absolute;
  top: 0.5rem;
  left: 0.5rem;
  text-align: left;
  padding: 0.3rem 0.8rem;
  background: rgba(0, 0, 0, 0.75);
  border-radius: 0.4rem;
  white-space: nowrap;

  color: ${(props) =>
    props.$trend === "up"
      ? "#7ddb8a"
      : props.$trend === "down"
        ? "#e58a8a"
        : "rgba(255, 255, 255, 0.85)"};
`;

const NewTag = styled.div`
  position: absolute;
  top: 0.5rem;
  left: 0.5rem;
  font-size: 1.2rem;
  font-weight: 700;
  padding: 0.2rem 0.6rem;
  background: #f2b64c;
  color: #1a1a17;
  border-radius: 0.4rem;
  pointer-events: none;
`;

interface Props {
  deck: FullDeckType;
  metaShare?: MetaShareEntry | null;
  metaShareLabel?: string;
}

const formatShare = (share: number): string => `${(share * 100).toFixed(1)}%`;

const deltaArrow = (trend: DeltaTrend): string => {
  if (trend === "up") return " ▲";
  if (trend === "down") return " ▼";
  return "";
};

const DeckCard = ({ deck, metaShare, metaShareLabel }: Props) => {
    const share = metaShare?.share ?? null;
    const delta = metaShare?.delta ?? null;
    const trend = deltaTrend(delta);

    return (
        <Container>
            <StyledDeckCard to={`/deck/${deck.id}`}>
                <DeckImage key={deck.iconPrimary.id} src={deck.iconPrimary.image} alt={deck.iconPrimary.name} />
                {metaShare && share !== null && (
                    <ShareBadge $trend={trend} title={metaShareLabel ?? "Meta share"}>
                        {formatShare(share)}
                        {deltaArrow(trend)}
                    </ShareBadge>
                )}
            </StyledDeckCard>
            {deck.iconSecondary && (
                <SubCard to={`/deck/${deck.id}`}>
                    <DeckImage
                        key={deck.iconSecondary.id}
                        src={deck.iconSecondary.image}
                        alt={deck.iconSecondary.name}
                    />
                </SubCard>
            )}
            {metaShare?.isNew && <NewTag>NEW</NewTag>}
        </Container>
    );
};

export default DeckCard;
