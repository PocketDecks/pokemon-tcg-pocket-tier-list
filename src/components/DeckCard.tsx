import styled from "styled-components";
import { Link } from "react-router";
import { FullDeckType } from "../contexts/DecksContext";
import { MetaShareEntry } from "../types/pipeline-data";
import { deltaTrend } from "../app/delta-trend";
import NavIcon from "./NavIcon";

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
  container-type: inline-size;
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

const Badge = styled.div<{ $tone: "up" | "down" | "flat" | "new" }>`
  position: absolute;
  top: 5cqw;
  left: 5cqw;
  display: inline-flex;
  align-items: center;
  gap: 0.25em;
  height: 1.9em;
  padding: 0 0.55em;
  border-radius: 0.5em;
  font-size: clamp(1rem, 13cqw, 1.4rem);
  font-weight: 700;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  pointer-events: none;
  background: ${(props) => (props.$tone === "new" ? "#f2b64c" : "rgba(10, 10, 9, 0.78)")};
  color: ${(props) =>
    props.$tone === "new"
      ? "#1a1a17"
      : props.$tone === "up"
        ? "#7ddb8a"
        : props.$tone === "down"
          ? "#e58a8a"
          : "rgba(255, 255, 255, 0.85)"};
  box-shadow: 0 0.1em 0.4em rgba(0, 0, 0, 0.35);

  svg {
    width: 0.9em;
    height: 0.9em;
  }
`;

interface Props {
  deck: FullDeckType;
  metaShare?: MetaShareEntry | null;
  metaShareLabel?: string;
}

const formatShare = (share: number): string => `${(share * 100).toFixed(1)}%`;


const DeckCard = ({ deck, metaShare, metaShareLabel }: Props) => {
    const share = metaShare?.share ?? null;
    const delta = metaShare?.delta ?? null;
    const trend = deltaTrend(delta);

    return (
        <Container>
            <StyledDeckCard to={`/deck/${deck.id}`}>
                <DeckImage key={deck.iconPrimary.id} src={deck.iconPrimary.image} alt={deck.iconPrimary.name} />
                {metaShare?.isNew ? (
                    <Badge $tone="new" title={metaShareLabel ?? "Meta share"}>
                        NEW
                    </Badge>
                ) : metaShare && share !== null ? (
                    <Badge $tone={trend} title={metaShareLabel ?? "Meta share"}>
                        {formatShare(share)}
                        {trend !== "flat" && (
                            <NavIcon name={trend === "up" ? "arrowUp" : "arrowDown"} size={12} />
                        )}
                    </Badge>
                ) : null}
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
        </Container>
    );
};

export default DeckCard;
