import styled from "styled-components";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import {
    ResponsiveContainer,
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    Legend,
} from "recharts";
import useIsPremium from "../../app/use-is-premium";
import { useQuery } from "@tanstack/react-query";
import { fetchCards } from "../../app/cards-api";
import { deckNameToIconIds } from "../../app/deck-filters";
import usePipelineTrends from "../../app/use-pipeline-trends";
import Header from "../../components/Header";
import SeoContent from "../../components/SeoContent";
import AdInContent from "../../ads/AdInContent";
import { useMarkContentReady } from "../../ads/ContentReadyContext";
/* eslint-disable-next-line no-restricted-imports -- pre-existing: this page
   still consumes DecksContext directly. Move behind src/app/ before adding more. */
import { useDecks } from "../../contexts/DecksContext";
import { buildTiers } from "../../app/tier-helper";
import { deckDisplayName, formatArchetypeId } from "../../app/deck-display";
import { latestExpansionName } from "../../app/use-expansions";
import crownIcon from "../../assets/crown.webp";

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
    background: var(--border);
    padding: 2.4rem;
    border-radius: 1.2rem;
    border: 1px solid var(--border);
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
    font-weight: 500;
`;

const ToggleContainer = styled.div`
    display: flex;
    gap: 0.8rem;
    background: var(--bg);
    padding: 0.4rem;
    border-radius: 0.8rem;
`;

const ToggleButton = styled.button<{ $active: boolean; $locked?: boolean }>`
    padding: 0.8rem 1.6rem;
    border-radius: 0.4rem;
    font-size: 1.4rem;
    font-weight: 500;
    background: ${(props) => (props.$active ? "var(--main)" : "transparent")};
    color: ${(props) => (props.$active ? "var(--bg)" : "var(--main)")};
    opacity: ${(props) => (props.$locked ? 0.5 : 1)};
    cursor: ${(props) => (props.$locked ? "not-allowed" : "pointer")};
    border: none;
    transition: all 0.2s ease;
`;

const ChartContainer = styled.div`
    width: 100%;
    height: 400px;
`;

const MatrixWrapper = styled.div`
    width: 100%;
    max-width: 100%;
    overflow-x: auto;
    border-radius: 0.8rem;
    border: 1px solid var(--border);
    -webkit-overflow-scrolling: touch;
    display: flex;
    justify-content: center;

    @media (max-width: 1300px) {
        justify-content: flex-start;
    }

    &::-webkit-scrollbar {
        height: 8px;
    }
    &::-webkit-scrollbar-thumb {
        background: var(--border);
        border-radius: 4px;
    }
`;

const MatrixTable = styled.table`
    border-collapse: separate; /* Fixes the sticky background clipping bug */
    border-spacing: 0;
    font-size: 1.3rem;
    text-align: center;
    table-layout: fixed;
    width: max-content;

    th,
    td {
        padding: 0.5rem;
        border-bottom: 1px solid var(--border);
        border-right: 1px solid var(--border);
        width: 75px;
        min-width: 75px;
        height: 75px;
    }

    thead th {
        border-top: 1px solid var(--border);
        position: sticky;
        top: 0;
        z-index: 2;
        background: var(--bg);
        color: var(--main);
        font-weight: 600;
        height: auto;
        padding: 1rem 0.5rem;
    }

    th:first-child,
    td:first-child {
        border-left: 1px solid var(--border);
    }

    @media (max-width: 900px) {
        font-size: 1.2rem;
        th,
        td {
            width: 60px;
            min-width: 60px;
            height: 60px;
            padding: 0.2rem;
        }
    }
`;

const MovementTable = styled.table`
    border-collapse: collapse;
    width: 100%;
    color: var(--main);

    th,
    td {
        /* The global reset sets every element to 10px, so sizing the table
           alone leaves the cells unreadable. */
        font-size: 1.4rem;
        padding: 1rem 1.2rem;
        text-align: left;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }

    th {
        font-weight: 600;
        opacity: 0.7;
    }

    td:first-child {
        opacity: 0.5;
        width: 4rem;
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
    color: ${(props) => (props.$rising ? "var(--e)" : "var(--s)")};
    font-weight: 600;
    white-space: nowrap;
`;

const MatrixCell = styled.td<{ $bg?: string; $isPopulated: boolean }>`
  background: ${(props) => props.$bg || "transparent"};
  color: ${(props) => (props.$isPopulated ? "#fff" : "var(--main)")};
  font-size: 1.3rem; /* 13px */
  font-weight: ${(props) => (props.$isPopulated ? "1000" : "500")};
  text-shadow: ${(props) =>
    props.$isPopulated
        ? "-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0px 2px 4px rgba(0,0,0,0.8)"
        : "none"};
  transition: filter 0.2s ease;
  cursor: crosshair;

  &:hover {
    filter: brightness(1.15);
  }
`;

const DeckLabelHeader = styled.th`
  position: sticky !important;
  left: 0 !important; /* Separated borders natively fix the 1px bleed */
  top: 0 !important;
  z-index: 3 !important; /* Outranks scrolling cells AND the header row */
  background: var(--bg) !important;
  text-align: left;
  width: 160px !important;
  min-width: 160px !important;

  @media (max-width: 900px) {
    width: 120px !important;
    min-width: 120px !important;
  }
`;

const DeckLabelCell = styled.td`
  position: sticky !important;
  left: 0 !important; /* Separated borders natively fix the 1px bleed */
  z-index: 1 !important; /* Outranks scrolling cells, ensuring opaque cover */
  background: var(--bg) !important; /* Enforces opaque cover */
  text-align: left;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  width: 160px !important;
  max-width: 160px !important;

  @media (max-width: 900px) {
    width: 120px !important;
    max-width: 120px !important;
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

const CrownLink = styled(Link)`
    flex-shrink: 0;
    display: inline-flex;
    margin-left: 0.4rem;

    img {
        width: 1.4rem;
        height: 1.4rem;
    }
`;

const TierDot = styled.div<{ $color: string }>`
    width: 0.8rem;
    height: 0.8rem;
    border-radius: 50%;
    background: ${(props) => props.$color};
    flex-shrink: 0;
`;

const HeaderRow = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
`;

const Loading = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 40rem;
    font-size: 2rem;
    font-weight: 500;
`;

const COLOR_PALETTE = [
    "var(--s)",
    "var(--a)",
    "var(--b)",
    "var(--c)",
    "var(--d)",
    "var(--e)",
];

const StatisticsPage = () => {
    const { t } = useTranslation();
    const { decks, metaShare, loading, error } = useDecks();
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
        return [...decks].sort((a, b) => b.score - a.score);
    }, [decks]);

    const matrixDecks = useMemo(() => {
        return isPremium ? sortedDecks : sortedDecks.slice(0, 10);
    }, [sortedDecks, isPremium]);

    const tierMap = useMemo(() => {
        const map = new Map<string, string>();
        const tiers = buildTiers(sortedDecks, (d) => d.score);
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

    const getMatrixStyle = (winRate: number | undefined) => {
        if (winRate === undefined) return { bg: "transparent" };
        const wr = Math.max(0, Math.min(1, winRate));

        if (wr >= 0.45 && wr <= 0.55) {
            return { bg: "#fff9c4" };
        }

        if (wr > 0.55) {
            const pct = Math.min(100, ((wr - 0.55) / 0.45) * 100);
            return {
                bg: `color-mix(in srgb, #1b5e20 ${pct}%, #fff9c4)`,
            };
        }

        const pct = Math.min(100, ((0.45 - wr) / 0.45) * 100);
        return {
            bg: `color-mix(in srgb, #b71c1c ${pct}%, #fff9c4)`,
        };
    };

    const topArchetypeNames =
        trendData.length > 0
            ? Object.keys(trendData[0]).filter((key) => key !== "date")
            : [];

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
                            onClick={() => {
                                if (isPremium) setRange("all-time");
                            }}
                        >
                            All Time {!isPremium && "🔒"}
                        </ToggleButton>
                    </ToggleContainer>
                </SectionHeader>

                <ChartContainer>
                    {trendQuery.failed ? (
                        <Loading>{t("statistics.noTrends")}</Loading>
                    ) : (
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={filteredTrendData}>
                            <XAxis
                                dataKey="date"
                                stroke="var(--main)"
                                opacity={0.6}
                                tickFormatter={(val) => val}
                            />
                            <YAxis
                                stroke="var(--main)"
                                opacity={0.6}
                                tickFormatter={(val) => `${val}%`}
                            />
                            <Tooltip
                                contentStyle={{
                                    background: "var(--bg)",
                                    border: "1px solid var(--border)",
                                    borderRadius: "8px",
                                    color: "var(--main)",
                                }}
                                formatter={(value: any, name: any) => [
                                    `${Number(value ?? 0).toFixed(1)}%`,
                                    name,
                                ]}
                            />
                            <Legend />
                            {topArchetypeNames.map((name, idx) => (
                                <Line
                                    key={name}
                                    type="monotone"
                                    dataKey={name}
                                    name={deckDisplayName(
                                        decks.find((d) => d.name === name) ?? { name }
                                    )}
                                    stroke={COLOR_PALETTE[idx % COLOR_PALETTE.length]}
                                    strokeWidth={3}
                                    dot={false}
                                />
                            ))}
                        </LineChart>
                    </ResponsiveContainer>
                    )}
                </ChartContainer>
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
                                    </td>
                                    <td>{(entry.share * 100).toFixed(1)}%</td>
                                    <Delta $rising={entry.delta > 0}>
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
                </SectionHeader>

                <MatrixWrapper>
                    <MatrixTable>
                        <thead>
                        <tr>
                            <DeckLabelHeader>Deck Archetype</DeckLabelHeader>
                            {matrixDecks.map((colDeck) => (
                                <th key={colDeck.id}>{deckDisplayName(colDeck)}</th>
                            ))}
                        </tr>
                        </thead>
                        <tbody>
                        {matrixDecks.map((rowDeck) => (
                            <tr key={rowDeck.id}>
                                <DeckLabelCell>
                                    <DeckNameWrapper>
                                        <TierDot
                                            $color={tierMap.get(rowDeck.id) || "transparent"}
                                        />
                                        <DeckNameText>{deckDisplayName(rowDeck)}</DeckNameText>
                                    </DeckNameWrapper>
                                </DeckLabelCell>
                                {matrixDecks.map((colDeck) => {
                                    if (rowDeck.id === colDeck.id) {
                                        return (
                                            <MatrixCell key={colDeck.id} $isPopulated={false}>
                                                -
                                            </MatrixCell>
                                        );
                                    }

                                    const match = rowDeck.matchups?.find(
                                        (m) => m.name === colDeck.name
                                    );
                                    const winRate = match?.winRate;
                                    const style = getMatrixStyle(winRate);
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
                                            $bg={style.bg}
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
            </Section>
            </>
        );
    };

    return (
        <PageContainer>
            <HeaderRow>
                <Header />
            </HeaderRow>

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
                    board. The grid colours shift from deep green for highly favourable
                    matchups to crimson red for the worst counters, passing through pale
                    yellow for even splits. Hover over any cell to check the total number
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