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
    CartesianGrid,
    type TooltipContentProps,
} from "recharts";
import useIsPremium from "../../app/use-is-premium";
import { useQuery } from "@tanstack/react-query";
import { fetchCards } from "../../app/cards-api";
import { deckNameToIconIds } from "../../app/deck-filters";
import usePipelineTrends from "../../app/use-pipeline-trends";
import SeoContent from "../../components/SeoContent";
import AdInContent from "../../ads/AdInContent";
import { useMarkContentReady } from "../../ads/ContentReadyContext";
import { useDecks } from "../../app/use-decks";
import { buildTiers } from "../../app/tier-helper";
import { deckDisplayName, formatArchetypeId } from "../../app/deck-display";
import { latestExpansionName } from "../../app/use-expansions";
import { sortByPowerScore } from "../../app/score-baseline";
import PageTitle from "../../components/PageTitle";
import NavIcon from "../../components/NavIcon";
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
    background: #121210;
    padding: 2.4rem;
    border-radius: 1.6rem;
    border: 1px solid rgba(255, 255, 255, 0.06);
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
            props.$active ? "var(--main)" : props.$locked ? "transparent" : "rgba(255, 255, 255, 0.08)"};
    }

    @media (max-width: 900px) {
        min-height: 4.4rem;
    }
`;

const ChartContainer = styled.div`
    font-size: 1.2rem;
    width: 100%;
    height: 36rem;
`;

const SeriesLegend = styled.ul`
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem 0.8rem;
    list-style: none;
`;

const SeriesButton = styled.button<{ $dimmed: boolean }>`
    display: inline-flex;
    align-items: center;
    gap: 0.8rem;
    min-height: 3.2rem;
    padding: 0.4rem 1rem;
    border-radius: 0.8rem;
    font-size: 1.3rem;
    color: var(--main);
    cursor: pointer;
    opacity: ${(props) => (props.$dimmed ? 0.45 : 1)};
    transition: opacity 160ms ease-out, background-color 160ms ease-out;

    &:hover,
    &[aria-pressed="true"] {
        background: rgba(255, 255, 255, 0.07);
    }

    @media (max-width: 900px) {
        min-height: 4.4rem;
    }
`;

const Swatch = styled.span<{ $color: string }>`
    width: 1.4rem;
    height: 0.4rem;
    border-radius: 0.2rem;
    background: ${(props) => props.$color};
    flex-shrink: 0;
`;

const TooltipCard = styled.div`
    min-width: 24rem;
    padding: 1.2rem 1.4rem;
    border-radius: 1rem;
    background: #1d1d1b;
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 0.8rem 2.4rem rgba(0, 0, 0, 0.45);
    font-size: 1.3rem;
    color: var(--main);
`;

const TooltipDate = styled.p`
    margin-bottom: 0.8rem;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.72);
`;

const TooltipRow = styled.div`
    display: grid;
    grid-template-columns: 1.4rem 1fr auto;
    align-items: center;
    gap: 0.8rem;
    padding: 0.2rem 0;
    font-variant-numeric: tabular-nums;
`;

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
    border-collapse: separate; /* Fixes the sticky background clipping bug */
    border-spacing: 0;
    font-size: 1.3rem;
    text-align: center;
    table-layout: fixed;
    width: 100%;
    min-width: ${(props) => 260 + props.$columns * 64}px;

    th,
    td {
        padding: 0.5rem;
        border-bottom: 2px solid #121210;
        border-right: 2px solid #121210;
        width: 64px;
        min-width: 64px;
        height: 52px;
    }

    thead th {
        border-top: 1px solid var(--border);
        position: sticky;
        top: 0;
        z-index: 2;
        background: #121210;
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
        border-bottom: 1px solid rgba(255, 255, 255, 0.07);
    }

    th {
        font-size: 1.2rem;
        font-weight: 600;
        letter-spacing: 0.02em;
        color: rgba(255, 255, 255, 0.6);
    }

    td:first-child,
    th:first-child {
        width: 4rem;
        color: rgba(255, 255, 255, 0.5);
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
        background: rgba(255, 255, 255, 0.03);
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
    color: ${(props) => (props.$rising ? "var(--e)" : "var(--s)")};
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
    background: rgba(255, 255, 255, 0.06);
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
    background: rgba(255, 255, 255, 0.5);
`;

const ShareValue = styled.span`
    min-width: 4.8rem;
    text-align: right;
`;

const ArtFrame = styled.span<{ $size: number }>`
    position: relative;
    display: inline-block;
    flex-shrink: 0;
    width: ${(props) => props.$size}rem;
    height: ${(props) => props.$size}rem;
    border-radius: 0.6rem;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.06);

    img {
        position: absolute;
        top: -32%;
        left: 50%;
        transform: translateX(-50%);
        height: 280%;
    }
`;

const HeaderArt = styled.span`
    display: inline-flex;
    justify-content: center;

    & > * + * {
        margin-left: -0.8rem;
        box-shadow: 0 0 0 2px #121210;
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

const ScaleLegend = styled.div`
    display: flex;
    align-items: center;
    gap: 1rem;
    font-size: 1.2rem;
    color: rgba(255, 255, 255, 0.72);
    font-variant-numeric: tabular-nums;
`;

const ScaleBar = styled.span`
    width: 16rem;
    height: 0.8rem;
    border-radius: 0.4rem;
    background: linear-gradient(to right, #b8312f, #383835, #256abf);
`;

const MatrixCell = styled.td<{ $bg?: string; $isPopulated: boolean }>`
  background: ${(props) => props.$bg || "#1d1d1b"};
  color: ${(props) => (props.$isPopulated ? "#fff" : "rgba(255, 255, 255, 0.4)")};
  font-size: 1.3rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  border-radius: 0.4rem;
  transition: box-shadow 160ms ease-out;

  &:hover {
    box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.75);
  }
`;

const DeckLabelHeader = styled.th`
  position: sticky !important;
  left: 0 !important; /* Separated borders natively fix the 1px bleed */
  top: 0 !important;
  z-index: 3 !important; /* Outranks scrolling cells AND the header row */
  background: #121210 !important;
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
  left: 0 !important; /* Separated borders natively fix the 1px bleed */
  z-index: 1 !important; /* Outranks scrolling cells, ensuring opaque cover */
  background: #121210 !important; /* Enforces opaque cover */
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

const Loading = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 40rem;
    font-size: 2rem;
    font-weight: 500;
`;

const SERIES_COLOURS = [
    "#3987e5",
    "#d95926",
    "#199e70",
    "#c98500",
    "#d55181",
    "#008300",
];

const MATRIX_EVEN = "#383835";
const MATRIX_FAVOURED = "#256abf";
const MATRIX_UNFAVOURED = "#b8312f";

const matrixColour = (winRate: number): string => {
    const t = Math.max(-1, Math.min(1, (winRate - 0.5) / 0.25));
    const pole = t >= 0 ? MATRIX_FAVOURED : MATRIX_UNFAVOURED;
    return `color-mix(in oklab, ${pole} ${Math.round(Math.abs(t) * 100)}%, ${MATRIX_EVEN})`;
};

const DeckArt = ({ src, size }: { src?: string; size: number }) => (
    <ArtFrame $size={size}>{src && <img src={src} alt="" loading="lazy" />}</ArtFrame>
);

const StatisticsPage = () => {
    const { t, i18n } = useTranslation();
    const { decks, metaShare, loading, error } = useDecks();
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

    const formatDay = (value: string) => {
        const date = new Date(value);
        return Number.isNaN(date.getTime())
            ? value
            : date.toLocaleDateString(i18n.language, { day: "numeric", month: "short" });
    };

    const cardImage = (id: string | undefined) =>
        id ? cardsPayload?.cards.find((c) => c.id === id)?.image : undefined;

    const maxMovementShare = Math.max(0.0001, ...movementDecks.map((d) => d.share));

    const renderTrendTooltip = ({ active, payload, label }: TooltipContentProps) => {
        if (!active || !payload?.length) return null;
        const rows = [...payload].sort((a, b) => Number(b.value ?? 0) - Number(a.value ?? 0));
        return (
            <TooltipCard>
                <TooltipDate>{formatDay(String(label))}</TooltipDate>
                {rows.map((row) => (
                    <TooltipRow key={String(row.dataKey)}>
                        <Swatch $color={row.color ?? "var(--main)"} />
                        <span>{row.name}</span>
                        <span>{Number(row.value ?? 0).toFixed(1)}%</span>
                    </TooltipRow>
                ))}
            </TooltipCard>
        );
    };

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

                <ChartContainer>
                    {trendQuery.failed ? (
                        <Loading>{t("statistics.noTrends")}</Loading>
                    ) : (
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                            data={filteredTrendData}
                            title={t("statistics.trends")}
                            margin={{ top: 8, right: 8, bottom: 0, left: -8 }}
                        >
                            <CartesianGrid
                                vertical={false}
                                stroke="rgba(255, 255, 255, 0.07)"
                            />
                            <XAxis
                                dataKey="date"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: "rgba(255, 255, 255, 0.6)" }}
                                tickFormatter={formatDay}
                                minTickGap={24}
                            />
                            <YAxis
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: "rgba(255, 255, 255, 0.6)" }}
                                tickFormatter={(val) => `${val}%`}
                                width={48}
                            />
                            <Tooltip
                                content={renderTrendTooltip}
                                cursor={{ stroke: "rgba(255, 255, 255, 0.24)", strokeWidth: 1 }}
                            />
                            {topArchetypeNames.map((name, idx) => (
                                <Line
                                    key={name}
                                    type="linear"
                                    dataKey={name}
                                    name={seriesLabel(name)}
                                    stroke={SERIES_COLOURS[idx]}
                                    strokeWidth={activeSeries === name ? 3 : 2}
                                    strokeOpacity={activeSeries && activeSeries !== name ? 0.18 : 1}
                                    dot={false}
                                    activeDot={{ r: 4, stroke: "#121210", strokeWidth: 2 }}
                                    isAnimationActive={false}
                                />
                            ))}
                        </LineChart>
                    </ResponsiveContainer>
                    )}
                </ChartContainer>

                {!trendQuery.failed && topArchetypeNames.length > 0 && (
                    <SeriesLegend>
                        {topArchetypeNames.map((name, idx) => (
                            <li key={name}>
                                <SeriesButton
                                    type="button"
                                    aria-pressed={pinnedSeries === name}
                                    $dimmed={!!activeSeries && activeSeries !== name}
                                    onMouseEnter={() => setHoveredSeries(name)}
                                    onMouseLeave={() => setHoveredSeries(null)}
                                    onFocus={() => setHoveredSeries(name)}
                                    onBlur={() => setHoveredSeries(null)}
                                    onClick={() =>
                                        setPinnedSeries((current) => (current === name ? null : name))
                                    }
                                >
                                    <Swatch $color={SERIES_COLOURS[idx]} />
                                    {seriesLabel(name)}
                                </SeriesButton>
                            </li>
                        ))}
                    </SeriesLegend>
                )}
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
                        <ScaleBar />
                        <span>75%</span>
                    </ScaleLegend>
                </SectionHeader>

                <MatrixWrapper>
                    <MatrixTable $columns={matrixDecks.length}>
                        <thead>
                        <tr>
                            <DeckLabelHeader>Deck Archetype</DeckLabelHeader>
                            {matrixDecks.map((colDeck) => (
                                <th key={colDeck.id} title={deckDisplayName(colDeck)}>
                                    <HeaderArt aria-hidden="true">
                                        <DeckArt size={2.8} src={colDeck.iconPrimary?.image} />
                                        {colDeck.iconSecondary && (
                                            <DeckArt size={2.8} src={colDeck.iconSecondary.image} />
                                        )}
                                    </HeaderArt>
                                    <VisuallyHidden>{deckDisplayName(colDeck)}</VisuallyHidden>
                                </th>
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
                                        <DeckArt size={2.8} src={rowDeck.iconPrimary?.image} />
                                        <DeckNameText>{deckDisplayName(rowDeck)}</DeckNameText>
                                    </DeckNameWrapper>
                                </DeckLabelCell>
                                {matrixDecks.map((colDeck) => {
                                    if (rowDeck.id === colDeck.id) {
                                        return (
                                            <MatrixCell key={colDeck.id} $isPopulated={false}>
                                                —
                                            </MatrixCell>
                                        );
                                    }

                                    const match = rowDeck.matchups?.find(
                                        (m) => m.name === colDeck.name
                                    );
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