import { useTranslation } from "react-i18next";
import DeckCard from "../../components/DeckCard";
import type { FullDeckType, MatchupType } from "../../app/deck-types";
import {
  DeckCardContainer,
  MatchupContainer,
  MatchupLabel,
  MatchupList,
  MatchupSection,
  MatchupSkeletonTile,
  MatchupUnavailable,
  SubHeader,
  VisuallyHidden,
} from "./deck-page.styles";

interface Props {
  title: string;
  headerColour: string;
  pending: boolean;
  failed: boolean;
  matchups: MatchupType[];
  decksByName: ReadonlyMap<string, FullDeckType>;
}

const MatchupListSection = ({ title, headerColour, pending, failed, matchups, decksByName }: Props) => {
  const { t } = useTranslation();
  return (
    <MatchupSection>
      <SubHeader $backgroundColor={headerColour}>{title}</SubHeader>
      {pending ? (
        <MatchupList aria-busy="true">
          {Array.from({ length: 6 }, (_, index) => (
            <MatchupSkeletonTile key={index} aria-hidden="true" />
          ))}
          <VisuallyHidden role="status">{t("deckPage.matchupsLoading")}</VisuallyHidden>
        </MatchupList>
      ) : failed ? (
        <MatchupUnavailable>{t("deckPage.matchupsUnavailable")}</MatchupUnavailable>
      ) : (
        <MatchupList>
          {matchups.map((matchup) => (
            <MatchupContainer key={matchup.name}>
              <DeckCardContainer>
                <DeckCard deck={decksByName.get(matchup.name)!} />
              </DeckCardContainer>
              <MatchupLabel $winRate={matchup.winRate}>
                {`${(matchup.winRate * 100).toFixed(0)}%`}
              </MatchupLabel>
            </MatchupContainer>
          ))}
        </MatchupList>
      )}
    </MatchupSection>
  );
};

export default MatchupListSection;
