import { useTranslation } from "react-i18next";
import {
  CardList,
  CardSection,
  DeckSkeleton,
  MatchupList,
  MatchupSection,
  MatchupSkeletonTile,
  PanelSection,
  SkeletonArt,
  SkeletonBody,
  SkeletonCard,
  SkeletonHero,
  SkeletonLine,
  SkeletonMeta,
  SkeletonTitle,
  StyledDeckPage,
  VisuallyHidden,
} from "./deck-page.styles";

interface Props {
  showPanel?: boolean;
}

const DeckPageSkeleton = ({ showPanel = true }: Props) => {
  const { t } = useTranslation();

  return (
    <DeckSkeleton data-testid="deck-page-skeleton">
      <SkeletonHero data-testid="deck-skeleton-hero">
        <SkeletonArt aria-hidden="true" />
        <SkeletonArt aria-hidden="true" />
        <SkeletonBody>
          <SkeletonTitle aria-hidden="true" />
          <SkeletonMeta aria-hidden="true" />
          <VisuallyHidden role="status">{t("deckPage.loading")}</VisuallyHidden>
        </SkeletonBody>
      </SkeletonHero>
      <StyledDeckPage>
        <CardSection>
          <CardList data-testid="deck-skeleton-grid">
            {Array.from({ length: 8 }, (_, index) => (
              <SkeletonCard key={index} aria-hidden="true" />
            ))}
          </CardList>
        </CardSection>
        {showPanel && (
          <PanelSection data-testid="deck-skeleton-panel">
            <MatchupSection aria-hidden="true">
              <SkeletonLine />
              <MatchupList>
                {Array.from({ length: 6 }, (_, index) => (
                  <MatchupSkeletonTile key={index} />
                ))}
              </MatchupList>
            </MatchupSection>
          </PanelSection>
        )}
      </StyledDeckPage>
    </DeckSkeleton>
  );
};

export default DeckPageSkeleton;
