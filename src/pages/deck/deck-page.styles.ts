import styled from "styled-components";
import { Link } from "react-router";
import { WINRATE_THRESHOLD } from "../../app/config";

export const StyledDeckPage = styled.div`
  width: 100%;
  min-height: 100dvh;
  display: flex;
  padding: 3rem;
  gap: 3rem;

  @media (max-width: 900px) {
    padding: 2.4rem;
    flex-direction: column;
    align-items: center;
  }
`;

export const CardSection = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2.4rem;
  flex: 1;
  width: calc(100% - 35rem - 3rem);

  @media (max-width: 900px) {
    width: 100%;
  }
`;

export const PanelSection = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2.4rem;
  width: 35rem;

  @media (max-width: 900px) {
    width: 100%;
  }
`;

export const DeckFinderHeader = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 8rem;
  background: var(--e);
  color: var(--bg);
  font-size: 3.2rem;
  font-weight: 500;
  text-align: center;
  padding: 0 4rem;

  @media (max-width: 900px) {
    font-size: 2.4rem;
    height: auto;
    padding: 2rem;
  }
`;

export const RelativeStrength = styled.div<{ $relativeScore: number }>`
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 8rem;
  background: ${(props) => {
    const colors = [
      "var(--s)",
      "var(--a)",
      "var(--b)",
      "var(--c)",
      "var(--d)",
      "var(--e)",
    ];
    const index = Math.floor(props.$relativeScore * (colors.length - 1));
    return colors[index];
  }};
  color: var(--bg);
  font-size: 3.2rem;
  font-weight: 500;
  text-align: center;
  padding: 0 4rem;
  margin-bottom: 2rem;

  @media (max-width: 900px) {
    font-size: 2.4rem;
    height: auto;
    padding: 2rem;
  }
`;

export const CardList = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
  gap: 2.4rem;
  width: 100%;
  max-width: 160rem;

  @media (max-width: 900px) {
    grid-template-columns: 1fr 1fr;
  }
`;

export const CardContainer = styled.button`
  position: relative;
  width: 100%;
  cursor: pointer;
`;

export const CardImage = styled.img`
  width: 100%;
  aspect-ratio: 63 / 88;
  display: block;
`;

export const CardNumber = styled.div`
  position: absolute;
  bottom: 0;
  right: 0;
  background: var(--s);
  color: var(--bg);
  height: 4rem;
  width: 4rem;
  transform: translate(30%, 30%);
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 2.8rem;
  font-weight: 500;
  border-radius: 50%;

  @media (max-width: 900px) {
    height: 3rem;
    width: 3rem;
    font-size: 2rem;
  }
`;

export const Overlay = styled.div`
  height: 100dvh;
  width: 100dvw;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 2.4rem;
  font-size: 2rem;
  font-weight: 500;
`;

export const Shrug = styled.div`
  font-size: 5rem;
  font-weight: 400;
  color: var(--main);
  line-height: 1.2;
  max-width: 60rem;
  text-align: center;

  @media (max-width: 900px) {
    font-size: 3.4rem;
  }
`;

export const EmptyMessage = styled.p`
  font-size: 2rem;
  font-weight: 500;
  max-width: 60rem;
  text-align: center;
  line-height: 1.6;
  color: var(--main);

  strong,
  em {
    font-size: inherit;
  }
`;

export const EmptyActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 1.6rem;
`;

export const Or = styled.span`
  font-size: 1.8rem;
  color: rgba(255, 255, 255, 0.6);
`;

export const UndoButton = styled.button<{ $disabled?: boolean }>`
  font-size: 1.8rem;
  font-weight: 500;
  color: var(--main);
  background: transparent;
  border: 1px solid var(--main);
  border-radius: 1.2rem;
  padding: 1rem 2.4rem;
  cursor: ${(props) => (props.$disabled ? "default" : "pointer")};
  opacity: ${(props) => (props.$disabled ? 0.4 : 1)};
  transition: opacity 0.2s ease;

  &:focus-visible {
    outline: 2px solid var(--main);
    outline-offset: 2px;
  }

  &:hover:not(:disabled) {
    opacity: 0.8;
  }
`;

export const StyledLink = styled(Link)`
  color: var(--main);
  font-weight: 500;
  font-size: 2rem;
  margin-left: 5px;
  text-decoration: underline;
`;

export const Matchups = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  gap: 2.4rem;

  @media (max-width: 900px) {
    flex-direction: column;
  }
`;

export const SubHeader = styled.div<{ $backgroundColor: string }>`
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  padding: 1rem 0;
  background: ${(props) => props.$backgroundColor};
  color: var(--bg);
  font-size: 2.8rem;
  font-weight: 500;
  opacity: 0.9;
`;

export const MatchupSection = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
  gap: 2.4rem;
  height: auto;

  @media (max-width: 900px) {
    width: 100%;
  }
`;

export const MatchupList = styled.div<{ $blur?: boolean }>`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr));
  gap: 1.2rem;
  flex: 1;
  width: 100%;
  filter: ${(props) => (props.$blur ? "blur(10px) saturate(1.2)" : "none")};

  @media (max-width: 900px) {
    grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
  }
`;

export const MatchupContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
  gap: 1.2rem;
`;

export const DeckCardContainer = styled.div`
  position: relative;
  height: 10rem;
  aspect-ratio: 1 / 1;

  @media (max-width: 900px) {
    height: 12rem;
  }
`;

export const MatchupLabel = styled.div<{ $winRate: number }>`
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  font-size: 2.4rem;
  font-weight: 500;
  color: ${(props) =>
      props.$winRate > WINRATE_THRESHOLD ? "var(--e)" : "var(--s)"};

  @media (max-width: 900px) {
    font-size: 2rem;
  }
`;

export const KeyStats = styled.div`
  display: grid;
  grid-template-columns: 16rem 9rem auto;
  align-items: center;
  justify-items: start;
  gap: 2rem 1.2rem;
  justify-content: center;

  @media (max-width: 900px) {
    grid-template-columns: 14rem 8rem auto;
  }
`;

/* Rows share fixed label/value column widths so the tooltip icons line
   up in one vertical column regardless of how wide each value is. */
export const KeyStatRow = styled.div`
  font-size: 2.4rem;
  font-weight: 400;
  display: contents;

  span {
    grid-column: 1;
  }

  > :nth-child(2) {
    grid-column: 2;
  }

  /* Rows without a tooltip still leave the third column free, so the next
     row's label cannot slide into it. */
  > :nth-child(3) {
    grid-column: 3;
  }

  @media (max-width: 900px) {
    font-size: 2rem;
  }
`;

export const KeyStatValue = styled.span`
  font-size: 2.4rem;
  font-weight: 500;
`;

export const AlternativeContainer = styled.div`
  position: relative;
  flex: 1;
  display: flex;
  align-items: center;
  gap: 4.8rem;
`;

export const AlternativeCard = styled.img`
  width: calc(50% - 2.4rem);
  aspect-ratio: 63 / 88;
  display: block;
`;

export const ArrowRight = styled.img`
  position: absolute;
  top: 50%;
  right: 50%;
  transform: translate(50%, -50%);
  height: 5rem;
`;
