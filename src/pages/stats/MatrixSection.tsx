import styled from "styled-components";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useMatchups } from "../../app/use-decks";
import { useTheme } from "../../app/use-theme";
import { buildTiers } from "../../app/tier-helper";
import { sortByPowerScore } from "../../app/score-baseline";
import { rankedDecks } from "../../app/ranked-deck";
import type { FullDeckType } from "../../app/deck-types";
import { matrixScale, mixOklab, type MatrixScale } from "../../styles/theme-tokens";
import { MatchupUnavailable, VisuallyHidden } from "../deck/deck-page.styles";
import MatchupMatrix from "./MatchupMatrix";
import { Section, SectionHeader, SectionTitle } from "./stats-section.styles";

const ScaleLegend = styled.div`
    display: flex;
    align-items: center;
    gap: 1rem;
    font-size: 1.2rem;
    color: var(--white-72);
    font-variant-numeric: tabular-nums;
`;

const ScaleBar = styled.span<{ $unfavoured: string; $even: string; $favoured: string }>`
    width: 16rem;
    height: 0.8rem;
    border-radius: 0.4rem;
    background: linear-gradient(
        to right,
        ${(props) => props.$unfavoured},
        ${(props) => props.$even},
        ${(props) => props.$favoured}
    );
`;

const MatchupSkeleton = styled.div`
    min-height: 40rem;
    border-radius: 0.8rem;
    background: var(--fill-hover);
`;

const matrixColour =
    (scale: MatrixScale) =>
    (winRate: number): string => {
        const t = Math.max(-1, Math.min(1, (winRate - 0.5) / 0.25));
        const pole = t >= 0 ? scale.favoured : scale.unfavoured;
        return mixOklab(scale.even, pole, Math.abs(t));
    };

const MatrixSection = ({ decks }: { decks: FullDeckType[] }) => {
    const { t } = useTranslation();
    const { theme } = useTheme();
    const scale = matrixScale[theme];
    const { matchupsByName, loading, error } = useMatchups();

    const sortedDecks = useMemo(() => sortByPowerScore(decks), [decks]);
    const tierMap = useMemo(() => {
        const map = new Map<string, string>();
        const tiers = buildTiers(rankedDecks(sortedDecks), (d) => d.powerScore);
        tiers.forEach((tier) => {
            tier.data.forEach((d) => map.set(d.id, tier.color));
        });
        return map;
    }, [sortedDecks]);

    return (
        <Section>
            <SectionHeader>
                <SectionTitle>{t("statistics.matrix")}</SectionTitle>
                <ScaleLegend aria-hidden="true">
                    <span>25%</span>
                    <ScaleBar
                        $unfavoured={scale.unfavoured}
                        $even={scale.even}
                        $favoured={scale.favoured}
                    />
                    <span>75%</span>
                </ScaleLegend>
            </SectionHeader>

            {loading ? (
                <MatchupSkeleton role="status" aria-busy="true">
                    <VisuallyHidden>{t("deckPage.matchupsLoading")}</VisuallyHidden>
                </MatchupSkeleton>
            ) : error ? (
                <MatchupUnavailable>{t("deckPage.matchupsUnavailable")}</MatchupUnavailable>
            ) : (
                <MatchupMatrix
                    decks={sortedDecks}
                    tierMap={tierMap}
                    matrixColour={matrixColour(scale)}
                    matchupsByName={matchupsByName}
                />
            )}
        </Section>
    );
};

export default MatrixSection;
