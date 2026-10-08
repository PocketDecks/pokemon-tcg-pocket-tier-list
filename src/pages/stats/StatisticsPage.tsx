import styled from "styled-components";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import useIsPremium from "../../app/use-is-premium";
import { useQuery } from "@tanstack/react-query";
import { fetchCards } from "../../app/cards-api";
import { deckNameToIconIds } from "../../app/deck-filters";
import usePipelineTrends from "../../app/use-pipeline-trends";
import SeoContent from "../../components/SeoContent";
import AdInContent from "../../ads/AdInContent";
import { useMarkContentReady } from "../../ads/ContentReadyContext";
import { useDecks, useMatchups } from "../../app/use-decks";
import { buildTiers } from "../../app/tier-helper";
import { deckDisplayName, formatArchetypeId } from "../../app/deck-display";
import { latestExpansionName } from "../../app/use-expansions";
import { sortByPowerScore } from "../../app/score-baseline";
import PageTitle from "../../components/PageTitle";
import NavIcon from "../../components/NavIcon";
import crownIcon from "../../assets/crown.webp";
import { formatTrendDay } from "./format-trend-day";
import TrendChart from "./TrendChart";
import MatchupMatrix from "./MatchupMatrix";
import DeckArt from "../../components/DeckArt";
import { MatchupUnavailable, VisuallyHidden } from "../deck/deck-page.styles";
import { matrixScale, mixOklab, type MatrixScale } from "../../styles/theme-tokens";
import { useTheme } from "../../app/use-theme";

const PageContainer = styled.div`
    width: 100%;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    padding: 3rem;
    gap: 3rem;
    overflow-x: hidden;

    @media (max-width: 900px) {
        padding: 2.4rem;
    }
`;

const Section = styled.section`
    display: flex;
    flex-direction: column;
    gap: 2rem;
    background: var(--surface-sunk);
    padding: 2.4rem;
    border-radius: 1.6rem;
    border: 1px solid var(--fill-hover);
    min-width: 0;
    contain: layout;

    @media (max-width: 900px) {
        padding: 1.6rem;
    }
`;

const SectionHeader = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;

    @media (max-width: 600px) {
        flex-direction: column;
        align-items: flex-start;
        gap: 1.2rem;
    }
`;

const SectionTitle = styled.h2`
    font-size: 2.4rem;
    font-weight: 600;
    letter-spacing: -0.01em;
`;

const ToggleContainer = styled.div`
    display: flex;
    gap: 0.8rem;
    background: var(--bg);
    padding: 0.4rem;
    border-radius: 0.8rem;
`;

const ToggleButton = styled.button<{ $active: boolean; $locked?: boolean }>`
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.8rem 1.6rem;
    border-radius: 0.4rem;
    font-size: 1.4rem;
    font-weight: 500;
    background: ${(props) => (props.$active ? "var(--main)" : "transparent")};
    color: ${(props) => (props.$active ? "var(--bg)" : "var(--main)")};
    opacity: ${(props) => (props.$locked ? 0.5 : 1)};
    cursor: ${(props) => (props.$locked ? "not-allowed" : "pointer")};
    border: none;
    transition: background-color 160ms ease-out, color 160ms ease-out;

    &:hover {
        background: ${(props) =>
            props.$active ? "var(--main)" : props.$locked ? "transparent" : "var(--line)"};
    }

    @media (max-width: 900px) {
        min-height: 4.4rem;
    }
`;

const MovementTable = styled.table`
    border-collapse: collapse;
    width: 100%;
    color: var(--main);

    font-size: 1.4rem;
    font-variant-numeric: tabular-nums;

    th,
    td {
        padding: 0.8rem 1.2rem;
        text-align: left;
        border-bottom: 1px solid var(--white-07);
    }

    th {
        font-size: 1.2rem;
        font-weight: 600;
        letter-spacing: 0.02em;
        color: var(--white-60);
    }

    td:first-child,
    th:first-child {
        width: 4rem;
        color: var(--white-50);
    }

    th:nth-child(3),
    td:nth-child(3) {
        width: 24rem;
    }

    th:last-child,
    td:last-child {
        width: 11rem;
        text-align: right;
    }

    tbody tr {
        transition: background-color 160ms ease-out;
    }

    tbody tr:hover {
        background: var(--white-03);
    }

    @media (max-width: 600px) {
        font-size: 1.3rem;

        th,
        td {
            padding: 0.8rem 0.6rem;
        }

        th:first-child,
        td:first-child {
            display: none;
        }

        th:nth-child(3),
        td:nth-child(3),
        th:last-child,
        td:last-child {
            width: auto;
        }
    }

    a {
        font-size: inherit;
        color: var(--main);
        text-decoration: none;
    }

    a:hover {
        text-decoration: underline;
    }

    tbody tr:last-child td {
        border-bottom: none;
    }
`;

const Delta = styled.td<{ $rising: boolean }>`
    color: ${(props) => (props.$rising ? "var(--f)" : "var(--s)")};
    font-weight: 600;
    white-space: nowrap;

    svg {
        vertical-align: -0.2rem;
        margin-right: 0.4rem;
    }
`;

const DeckCell = styled.div`
    display: flex;
    align-items: center;
    gap: 1.2rem;
    min-width: 0;
`;

const ShareCell = styled.div`
    display: flex;
    align-items: center;
    gap: 1.2rem;
`;

const ShareTrack = styled.span`
    flex: 1;
    height: 0.6rem;
    border-radius: 0.3rem;
    background: var(--fill-hover);
    overflow: hidden;

    @media (max-width: 600px) {
        display: none;
    }
`;

const ShareFill = styled.span<{ $width: number }>`
    display: block;
    width: ${(props) => props.$width}%;
    height: 100%;
    border-radius: 0.3rem;
    background: var(--white-50);
`;

const ShareValue = styled.span`
    min-width: 4.8rem;
    text-align: right;
`;

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

const CrownLink = styled(Link)`
    flex-shrink: 0;
    display: inline-flex;
    margin-left: 0.4rem;

    img {
        width: 1.4rem;
        height: 1.4rem;
    }
`;

const Loading = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 40rem;
    font-size: 2rem;
    font-weight: 500;
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
        return mixOklab(pole, scale.even, Math.abs(t));
    };

const StatisticsPage = () => {
    const { t, i18n } = useTranslation();
    const { theme } = useTheme();
    const scale = matrixScale[theme];
    const matrixColourFor = matrixColour(scale);
    const { decks, metaShare, loading, error } = useDecks();
    const { matchupsByName, loading: matchupsLoading, error: matchupsError } = useMatchups();
    const [hoveredSeries, setHoveredSeries] = useState<string | null>(null);
    const [pinnedSeries, setPinnedSeries] = useState<string | null>(null);
    const activeSeries = hoveredSeries ?? pinnedSeries;
    const isPremium = useIsPremium();
    const [range, setRange] = useState<"14-day" | "all-time">("14-day");
    const trendQuery = usePipelineTrends();
    const trendData = trendQuery.rows;
    const [movementView, setMovementView] = useState<"rising" | "falling" | "new">("rising");

    useMarkContentReady(!loading && !!decks);

    const { data: cardsPayload } = useQuery({
        queryKey: ["cards"],
        queryFn: fetchCards,
    });

    const movementDecks = useMemo(() => {
        if (!metaShare) return [];
        const entries = [...metaShare.decks];
        if (movementView === "new") {
            return entries.filter((d) => d.isNew).sort((a, b) => b.share - a.share);
        }
        if (movementView === "rising") {
            return entries
                .filter((d) => d.delta > 0.001)
                .sort((a, b) => b.delta - a.delta)
                .slice(0, 15);
        }
        return entries
            .filter((d) => d.delta < -0.001)
            .sort((a, b) => a.delta - b.delta)
            .slice(0, 15);
    }, [metaShare, movementView]);

    const sortedDecks = useMemo(() => {
        if (!decks) return [];
        return sortByPowerScore(decks);
    }, [decks]);

    const matrixDecks = useMemo(() => {
        return isPremium ? sortedDecks : sortedDecks.slice(0, 10);
    }, [sortedDecks, isPremium]);

    const tierMap = useMemo(() => {
        const map = new Map<string, string>();
        const tiers = buildTiers(
          sortedDecks.filter((d) => d.powerScore !== null),
          (d) => d.powerScore ?? -1
        );
        tiers.forEach((t) => {
            t.data.forEach((d) => map.set(d.id, t.color));
        });
        return map;
    }, [sortedDecks]);

    const filteredTrendData = useMemo(() => {
        if (!trendData.length) return [];
        if (range === "all-time") return trendData;

        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 14);
        return trendData.filter((d) => new Date(d.date) >= cutoff);
    }, [trendData, range]);

    const topArchetypeNames =
        trendData.length > 0
            ? Object.keys(trendData[0]).filter((key) => key !== "date")
            : [];

    const seriesLabel = (name: string) =>
        deckDisplayName(decks?.find((d) => d.name === name) ?? { name });

    const formatDay = (value: string) => formatTrendDay(value, i18n.language);

    const cardImage = (id: string | undefined) =>
        id ? cardsPayload?.cards.find((c) => c.id === id)?.image : undefined;

    const maxMovementShare = Math.max(0.0001, ...movementDecks.map((d) => d.share));



    // The static shell (header + SEO copy) renders even while deck data is in
    // flight. The build-time prerender snapshots this route with no network
    // data available,
    // so returning early here would ship a page whose only content is
    // "Loading..." to crawlers.
    const renderContent = () => {
            if (loading) return <Loading>Loading...</Loading>;
            if (error) return <Loading>Error loading data: {error.message}</Loading>;
            if (!decks) return <Loading>Loading...</Loading>;

            return (
            <>
            <Section>
                <SectionHeader>
                    <SectionTitle>{t("statistics.trends")}</SectionTitle>
                    <ToggleContainer>
                        <ToggleButton
                            $active={range === "14-day"}
                            onClick={() => setRange("14-day")}
                        >
                            14 Days
                        </ToggleButton>
                        <ToggleButton
                            $active={range === "all-time"}
                            $locked={!isPremium}
                            aria-disabled={!isPremium}
                            onClick={() => {
                                if (isPremium) setRange("all-time");
                            }}
                        >
                            All Time
                            {!isPremium && <NavIcon name="lock" size={14} />}
                        </ToggleButton>
                    </ToggleContainer>
                </SectionHeader>

                <TrendChart
                    data={filteredTrendData}
                    names={topArchetypeNames}
                    title={t("statistics.trends")}
                    failed={trendQuery.failed}
                    noDataLabel={t("statistics.noTrends")}
                    activeSeries={activeSeries}
                    pinnedSeries={pinnedSeries}
                    formatDay={formatDay}
                    seriesLabel={seriesLabel}
                    onHover={setHoveredSeries}
                    onPin={(name) =>
                        setPinnedSeries((current) => (current === name ? null : name))
                    }
                />
            </Section>

            <AdInContent placement="statistics" />

            <Section>
                <SectionHeader>
                    <SectionTitle>{t("statistics.metaMovement")}</SectionTitle>
                    <ToggleContainer>
                        {(["rising", "falling", "new"] as const).map((view) => (
                            <ToggleButton
                                key={view}
                                $active={movementView === view}
                                aria-pressed={movementView === view}
                                onClick={() => setMovementView(view)}
                            >
                                {view === "rising"
                                    ? t("statistics.rising")
                                    : view === "falling"
                                      ? t("statistics.falling")
                                      : t("statistics.newDecks")}
                            </ToggleButton>
                        ))}
                    </ToggleContainer>
                </SectionHeader>

                {movementDecks.length > 0 ? (
                    <MovementTable>
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>{t("statistics.deckColumn")}</th>
                                <th>{t("statistics.shareColumn")}</th>
                                <th>{t("statistics.deltaColumn")}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {movementDecks.map((entry, index) => (
                                <tr key={entry.name}>
                                    <td>{index + 1}</td>
                                    <td>
                                        <DeckCell>
                                        <DeckArt
                                            size={2.8}
                                            src={
                                                decks?.find((d) => d.id === entry.name)?.iconPrimary?.image ??
                                                cardImage(deckNameToIconIds(entry.name)[0])
                                            }
                                        />
                                        {(() => {
                                            const deck = decks?.find(
                                                (d) => d.id === entry.name
                                            );
                                            const cards = cardsPayload?.cards;
                                            const iconNames = deck
                                                ? null
                                                : cards
                                                  ? deckNameToIconIds(entry.name)
                                                        .map((id) => cards.find((c) => c.id === id)?.name)
                                                        .filter(Boolean)
                                                        .join(" / ")
                                                  : null;
                                            return (
                                                <Link to={`/deck/${entry.name}`}>
                                                    {deck
                                                        ? deckDisplayName(deck)
                                                        : iconNames ||
                                                          formatArchetypeId(entry.name)}
                                                </Link>
                                            );
                                        })()}
                                        {!decks?.some((d) => d.id === entry.name) && (
                                            <CrownLink to="/about#premium" aria-label="Premium">
                                                <img src={crownIcon} alt="" />
                                            </CrownLink>
                                        )}
                                        </DeckCell>
                                    </td>
                                    <td>
                                        <ShareCell>
                                            <ShareTrack aria-hidden="true">
                                                <ShareFill $width={(entry.share / maxMovementShare) * 100} />
                                            </ShareTrack>
                                            <ShareValue>{(entry.share * 100).toFixed(1)}%</ShareValue>
                                        </ShareCell>
                                    </td>
                                    <Delta $rising={entry.delta > 0}>
                                        <NavIcon name={entry.delta > 0 ? "arrowUp" : "arrowDown"} size={14} />
                                        {entry.delta > 0
                                            ? `+${(entry.delta * 100).toFixed(1)} pp`
                                            : `${(entry.delta * 100).toFixed(1)} pp`}
                                    </Delta>
                                </tr>
                            ))}
                        </tbody>
                    </MovementTable>
                ) : metaShare !== null ? (
                    <Loading>{t("statistics.noMovement")}</Loading>
                ) : null}
            </Section>

            <AdInContent placement="statistics" />

            <Section>
                <SectionHeader>
                    <SectionTitle>
                        {t("statistics.matrix")}
                    </SectionTitle>
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

                {matchupsLoading ? (
                    <MatchupSkeleton role="status" aria-busy="true">
                        <VisuallyHidden>{t("deckPage.matchupsLoading")}</VisuallyHidden>
                    </MatchupSkeleton>
                ) : matchupsError ? (
                    <MatchupUnavailable>{t("deckPage.matchupsUnavailable")}</MatchupUnavailable>
                ) : (
                    <MatchupMatrix
                        decks={matrixDecks}
                        tierMap={tierMap}
                        matrixColour={matrixColourFor}
                        matchupsByName={matchupsByName}
                    />
                )}
            </Section>
            </>
        );
    };

    return (
        <PageContainer>
            <PageTitle>{t("header.statistics")}</PageTitle>

            {renderContent()}

            <SeoContent>
                <h2>Pokémon TCG Pocket statistics and meta trends</h2>
                <p>
                    Analyse the current Pokémon TCG Pocket metagame using live historical
                    data and archetype matchup heatmaps. This tracking data maps exactly
                    how deck popularity and win rates shift over time within the{" "}
                    {latestExpansionName() ?? ""} format. We pull results straight from recent
                    competitive events, giving you a statistical edge over players
                    relying on gut feeling alone.
                </p>

                <h3>Track the best decks</h3>
                <p>
                    The trend graph plots the top archetypes over a 14-day window. You
                    can see exactly when a deck peaks in popularity or falls out of
                    favour as the meta adapts. Premium users can unlock the all-time view
                    to evaluate long-term trends since a specific expansion release. For
                    instance, looking closely at the recent data, you will immediately
                    notice aggressive shifts: when a top-tier threat begins dominating
                    the standings, counter-decks naturally rise to answer them.
                </p>
                <p>
                    Cross-reference these stats with our{" "}
                    <Link to="/tier-list">tier list</Link> to see how raw data translates
                    into competitive rankings.
                </p>

                <h3>Read the matchup matrix</h3>
                <p>
                    The matchup matrix breaks down head-to-head win rates across the
                    board. The grid colours shift from deep blue for highly favourable
                    matchups to red for the worst counters, passing through grey for even
                    splits. Hover over any cell to check the total number
                    of games played. This ensures the sample size is reliable before you
                    commit to a strategy.
                </p>
                <p>
                    If you spot a severe weakness in your own deck's matchups, use the{" "}
                    <Link to="/deck">best deck finder</Link> to see if your current card
                    collection supports building a stronger counter-meta option.
                </p>

                <h3>Effective tournament games</h3>
                <p>
                    You might notice that the total game counts displayed on hover are
                    rounded estimates of exact totals. The analysis pipeline applies a
                    recency multiplier to older tournament results, meaning a game played
                    yesterday carries slightly more weight than a game played three weeks
                    ago. This keeps the matchup matrix highly responsive to recent
                    deckbuilding innovations without throwing away valuable historical
                    data.
                </p>
            </SeoContent>
        </PageContainer>
    );
};

export default StatisticsPage;