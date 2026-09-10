import styled from "styled-components";
import { buildTiers } from "../app/tier-helper";
import React, { type ReactNode } from "react";

const Page = styled.div`
  width: 100%;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;

  @media (max-width: 900px) {
    height: auto;
  }
`;

const FilterContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  position: absolute;
  top: 2rem;
  right: 2rem;
  gap: 1.5rem;
  z-index: 10;

  @media (max-width: 900px) {
    position: relative;
    top: 0;
    right: 0;
    margin: 2rem;
    width: calc(100% - 4rem);
    justify-content: space-between;
    align-items: center;
  }
`;

const TierRow = styled.div`
  width: 100%;
  display: flex;
  flex: 1;
  border-bottom: 0.4rem solid var(--border);

  @media (min-width: 900px) {
    position: relative;
    &::after {
      content: "";
      position: absolute;
      top: 0;
      right: 0;
      width: 100px;
      height: 100%;
      background: linear-gradient(to right, rgba(255, 255, 255, 0), var(--bg));
    }
  }

  @media (max-width: 900px) {
    flex-direction: column;
  }
`;

const RowHeader = styled.div<{ $backgroundColor: string }>`
  height: 100%;
  aspect-ratio: 1 / 1;
  background: ${(props) => props.$backgroundColor};
  color: rgba(0, 0, 0, 0.7);
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 3.3rem;
  font-weight: 400;

  @media (max-width: 900px) {
    width: 100%;
    height: 8rem;
  }
`;

const RowContent = styled.div`
  height: 100%;
  flex: 1;
  padding: 1.5rem 2rem;
  display: flex;
  gap: 2rem;
  width: 100%;

  @media (min-width: 900px) {
    overflow-x: auto;
  }

  @media (max-width: 900px) {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    padding: 2rem;
  }
`;

const Loading = styled.div`
  height: 100dvh;
  width: 100dvw;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 2rem;
  font-weight: 500;
`;

interface Props<T> {
  items: T[] | null;
  getScore: (item: T) => number;
  getKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  /** Decides whether an item can be banded into a tier. Items the predicate rejects drop into a neutral unranked row. Defaults to every item being rankable. */
  isRanked?: (item: T) => boolean;
  /** Rendered above the tiers, inside the page shell. Absent on the expansion list. */
  filters?: ReactNode;
  /** Rendered after the last tier row, inside the page shell. */
  footer?: ReactNode;
  loadingLabel?: string;
  emptyLabel?: string;
}

const TierGrid = <T,>({
  items,
  getScore,
  getKey,
  renderItem,
  isRanked = () => true,
  filters,
  footer,
  loadingLabel = "Loading...",
  emptyLabel = "No decks found",
}: Props<T>) => {
  if (items === null) {
    return <Loading>{loadingLabel}</Loading>;
  }
  if (items.length === 0) {
    return <Loading>{emptyLabel}</Loading>;
  }

  // The caller states which items can be banded. Items the predicate rejects
  // land in a neutral unranked row, so the grid never infers rankedness from
  // a score's sign.
  const rankable = items.filter((item) => isRanked(item));
  const unranked = items.filter((item) => !isRanked(item));
  const tiers = buildTiers(rankable, getScore);

  return (
    <Page>
      {filters && <FilterContainer>{filters}</FilterContainer>}
      {tiers.map((tier) => (
        <TierRow key={tier.label}>
          <RowHeader $backgroundColor={tier.color}>{tier.label}</RowHeader>
          <RowContent>
            {tier.data.map((item) => (
              <React.Fragment key={getKey(item)}>
                {renderItem(item)}
              </React.Fragment>
            ))}
          </RowContent>
        </TierRow>
      ))}
      {unranked.length > 0 && (
        <TierRow key="unranked" data-testid="unranked-row">
          <RowHeader $backgroundColor="var(--unranked, #3a3a36)">?</RowHeader>
          <RowContent>
            {unranked.map((item) => (
              <React.Fragment key={getKey(item)}>
                {renderItem(item)}
              </React.Fragment>
            ))}
          </RowContent>
        </TierRow>
      )}
      {footer}
    </Page>
  );
};

export default TierGrid;