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

export const FinderHelper = styled.p`
  width: 100%;
  max-width: 72ch;
  align-self: flex-start;
  font-size: 1.5rem;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.72);
`;

export const Strength = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  min-width: 18rem;
`;

export const StrengthLabel = styled.span`
  font-size: 1.2rem;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.6);
  font-variant-numeric: tabular-nums;
`;

export const StrengthTrack = styled.span`
  height: 0.8rem;
  border-radius: 0.4rem;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
`;

export const StrengthFill = styled.span<{ $value: number }>`
  display: block;
  width: ${(props) => Math.round(props.$value * 100)}%;
  height: 100%;
  border-radius: 0.4rem;
  background: var(--main);
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

export const CardContainer = styled.button<{ $stacked: boolean }>`
  position: relative;
  isolation: isolate;
  width: 100%;
  cursor: pointer;

  ${(props) =>
    props.$stacked &&
    `
      &::before {
        content: "";
        position: absolute;
        inset: 0.4rem -0.6rem -0.6rem 0.4rem;
        z-index: -1;
        border-radius: 1rem;
        background: rgba(255, 255, 255, 0.16);
        box-shadow: 0 0.4rem 1.2rem rgba(0, 0, 0, 0.35);
      }
    `}

  img {
    transition: transform 200ms cubic-bezier(0.16, 1, 0.3, 1);
  }

  &:hover img {
    transform: translateY(-0.3rem);
  }
`;

export const CardImage = styled.img`
  width: 100%;
  aspect-ratio: 63 / 88;
  display: block;
`;

export const CardNumber = styled.span<{ $count: number }>`
  position: absolute;
  right: 0.8rem;
  bottom: 0.8rem;
  min-width: 3.6rem;
  height: 2.6rem;
  padding: 0 0.8rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 1.3rem;
  background: ${(props) => (props.$count > 1 ? "var(--main)" : "rgba(18, 18, 16, 0.82)")};
  color: ${(props) => (props.$count > 1 ? "var(--bg)" : "var(--main)")};
  box-shadow: 0 0.2rem 0.8rem rgba(0, 0, 0, 0.45);
  font-size: 1.5rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;

  &::before {
    content: "×";
    margin-right: 0.1rem;
  }

  @media (max-width: 900px) {
    right: 0.6rem;
    bottom: 0.6rem;
    min-width: 3.2rem;
    height: 2.4rem;
    font-size: 1.4rem;
  }
`;

export const Overlay = styled.div`
  min-height: 100%;
  width: 100%;
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

export const SubHeader = styled.h2<{ $backgroundColor: string }>`
  display: flex;
  align-items: center;
  gap: 1rem;
  width: 100%;
  font-size: 2rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--main);

  &::before {
    content: "";
    flex-shrink: 0;
    width: 1.2rem;
    height: 1.2rem;
    border-radius: 0.3rem;
    background: ${(props) => props.$backgroundColor};
  }
`;

export const MatchupSection = styled.section`
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
  gap: 2rem;
  height: auto;
  padding: 2rem;
  border-radius: 1.6rem;
  background: #121210;
  border: 1px solid rgba(255, 255, 255, 0.06);

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
      props.$winRate > WINRATE_THRESHOLD ? "var(--f)" : "var(--s)"};

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

  > :first-child {
    font-size: 1.6rem;
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
