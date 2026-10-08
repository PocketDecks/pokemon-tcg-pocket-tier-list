import styled from "styled-components";
import { deckDisplayName, formatArchetypeId } from "../../app/deck-display";
import type { FullDeckType, MatchupType } from "../../app/deck-types";
import DeckArt from "../../components/DeckArt";
import { matrixScale } from "../../styles/theme-tokens";

const MatrixWrapper = styled.div`
    width: 100%;
    max-width: 100%;
    overflow-x: auto;
    border-radius: 0.8rem;
    -webkit-overflow-scrolling: touch;

    &::-webkit-scrollbar {
        height: 8px;
    }

    &::-webkit-scrollbar-thumb {
        background: var(--border);
        border-radius: 4px;
    }
`;

const MatrixTable = styled.table<{ $columns: number }>`
    border-collapse: separate;
    border-spacing: 0;
    font-size: 1.3rem;
    text-align: center;
    table-layout: fixed;
    width: 100%;
    min-width: ${(props) => 260 + props.$columns * 64}px;

    th,
    td {
        padding: 0.5rem;
        border-bottom: 2px solid var(--surface-sunk);
        border-right: 2px solid var(--surface-sunk);
        width: 64px;
        min-width: 64px;
        height: 52px;
    }

    thead th {
        border-top: 1px solid var(--border);
        position: sticky;
        top: 0;
        z-index: 2;
        background: var(--surface-sunk);
        color: var(--main);
        font-weight: 600;
        height: auto;
        padding: 0.8rem 0.4rem;
    }

    @media (max-width: 900px) {
        font-size: 1.2rem;
        th,
        td {
            width: 52px;
            min-width: 52px;
            height: 48px;
            padding: 0.2rem;
        }

        min-width: ${(props) => 140 + props.$columns * 52}px;
    }
`;

const DeckLabelHeader = styled.th`
    position: sticky !important;
    left: 0 !important;
    top: 0 !important;
    z-index: 3 !important;
    background: var(--surface-sunk) !important;
    text-align: left;
    vertical-align: bottom;
    width: 260px !important;
    min-width: 260px !important;

    @media (max-width: 900px) {
        width: 140px !important;
        min-width: 140px !important;
    }
`;

const DeckLabelCell = styled.td`
    position: sticky !important;
    left: 0 !important;
    z-index: 1 !important;
    background: var(--surface-sunk) !important;
    text-align: left;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    width: 260px !important;
    max-width: 260px !important;

    @media (max-width: 900px) {
        width: 140px !important;
        max-width: 140px !important;
    }
`;

const DeckNameWrapper = styled.div`
    display: flex;
    align-items: center;
    gap: 0.8rem;
    padding-left: 0.4rem;
    overflow: hidden;
`;

const DeckNameText = styled.span`
    overflow: hidden;
    text-overflow: ellipsis;
`;

const TierDot = styled.div<{ $color: string }>`
    width: 0.8rem;
    height: 0.8rem;
    border-radius: 50%;
    background: ${(props) => props.$color};
    flex-shrink: 0;
`;

const HeaderArt = styled.span`
    display: inline-flex;
    justify-content: center;

    & > * + * {
        margin-left: -0.8rem;
        box-shadow: 0 0 0 2px var(--surface-sunk);
    }
`;

const VisuallyHidden = styled.span`
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
`;

const MatrixCell = styled.td<{ $bg?: string; $isPopulated: boolean }>`
    background: ${(props) => props.$bg || matrixScale.dark.empty};
    color: ${(props) => (props.$isPopulated ? matrixScale.dark.populatedText : matrixScale.dark.emptyText)};
    font-size: 1.3rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    border-radius: 0.4rem;
    transition: box-shadow 160ms ease-out;

    &:hover {
        box-shadow: inset 0 0 0 2px var(--white-75);
    }
`;

interface Props {
    decks: FullDeckType[];
    tierMap: Map<string, string>;
    matrixColour: (winRate: number) => string;
    matchupsByName: Record<string, MatchupType[]> | null;
}

const MatchupMatrix = ({ decks, tierMap, matrixColour, matchupsByName }: Props) => (
    <MatrixWrapper>
        <MatrixTable $columns={decks.length}>
            <thead>
                <tr>
                    <DeckLabelHeader>Deck Archetype</DeckLabelHeader>
                    {decks.map((colDeck) => (
                        <th key={colDeck.id} title={deckDisplayName(colDeck)}>
                            {colDeck.iconPrimary?.image ? (
                                <>
                                    <HeaderArt aria-hidden="true">
                                        <DeckArt size={2.8} src={colDeck.iconPrimary.image} />
                                        {colDeck.iconSecondary && (
                                            <DeckArt size={2.8} src={colDeck.iconSecondary.image} />
                                        )}
                                    </HeaderArt>
                                    <VisuallyHidden>{deckDisplayName(colDeck)}</VisuallyHidden>
                                </>
                            ) : (
                                deckDisplayName(colDeck)
                            )}
                        </th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {decks.map((rowDeck) => (
                    <tr key={rowDeck.id}>
                        <DeckLabelCell>
                            <DeckNameWrapper>
                                <TierDot $color={tierMap.get(rowDeck.id) || "transparent"} />
                                <DeckArt size={2.8} src={rowDeck.iconPrimary?.image} />
                                <DeckNameText>{deckDisplayName(rowDeck)}</DeckNameText>
                            </DeckNameWrapper>
                        </DeckLabelCell>
                        {decks.map((colDeck) => {
                            if (rowDeck.id === colDeck.id) {
                                return (
                                    <MatrixCell key={colDeck.id} $isPopulated={false}>
                                        —
                                    </MatrixCell>
                                );
                            }

                            const match = matchupsByName?.[rowDeck.name]?.find((m) => m.name === colDeck.name);
                            const winRate = match?.winRate;
                            const isPopulated = winRate !== undefined;
                            const winRateText = isPopulated
                                ? `${Math.round(winRate * 100)}%`
                                : "N/A";
                            const hoverText = match
                                ? `${winRateText} win rate vs. ${formatArchetypeId(
                                      colDeck.name
                                  )} (${Math.round(match.totalGames)} total games)`
                                : undefined;

                            return (
                                <MatrixCell
                                    key={colDeck.id}
                                    $bg={isPopulated ? matrixColour(winRate) : undefined}
                                    $isPopulated={isPopulated}
                                    title={hoverText}
                                >
                                    {winRateText}
                                </MatrixCell>
                            );
                        })}
                    </tr>
                ))}
            </tbody>
        </MatrixTable>
    </MatrixWrapper>
);

export default MatchupMatrix;
