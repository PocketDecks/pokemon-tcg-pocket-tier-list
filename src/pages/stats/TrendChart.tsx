import styled from "styled-components";
import {
    CartesianGrid,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
    type TooltipContentProps,
} from "recharts";
import type { PipelineTrendRow } from "../../types/pipeline-data";
import { chartChrome, chartSeries } from "../../styles/theme-tokens";
import { useTheme } from "../../app/use-theme";
import { isPrerender } from "../../app/prerender";

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
        background: var(--white-07);
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

const TooltipCard = styled.div<{ $border: string }>`
    min-width: 24rem;
    padding: 1.2rem 1.4rem;
    border-radius: 1rem;
    background: var(--surface);
    border: 1px solid ${(props) => props.$border};
    box-shadow: 0 0.8rem 2.4rem var(--shadow-strong);
    font-size: 1.3rem;
    color: var(--main);
`;

const TooltipDate = styled.p<{ $color: string }>`
    margin-bottom: 0.8rem;
    font-weight: 600;
    color: ${(props) => props.$color};
`;

const TooltipRow = styled.div`
    display: grid;
    grid-template-columns: 1.4rem 1fr auto;
    align-items: center;
    gap: 0.8rem;
    padding: 0.2rem 0;
    font-variant-numeric: tabular-nums;
`;

const ChartLoading = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 40rem;
    font-size: 2rem;
    font-weight: 500;
`;

interface Props {
    data: PipelineTrendRow[];
    names: string[];
    title: string;
    failed: boolean;
    noDataLabel: string;
    activeSeries: string | null;
    pinnedSeries: string | null;
    formatDay: (value: string) => string;
    seriesLabel: (name: string) => string;
    onHover: (name: string | null) => void;
    onPin: (name: string) => void;
}

const TrendChart = ({
    data,
    names,
    title,
    failed,
    noDataLabel,
    activeSeries,
    pinnedSeries,
    formatDay,
    seriesLabel,
    onHover,
    onPin,
}: Props) => {
    const { theme } = useTheme();
    const seriesColours = chartSeries[theme];
    const chrome = chartChrome[theme];

    const renderTooltip = ({ active, payload, label }: TooltipContentProps) => {
        if (!active || !payload?.length) return null;
        const rows = [...payload].sort((a, b) => Number(b.value ?? 0) - Number(a.value ?? 0));
        return (
            <TooltipCard role="status" aria-live="assertive" $border={chrome.grid}>
                <TooltipDate $color={chrome.tick}>{formatDay(String(label))}</TooltipDate>
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

    return (
        <>
            <ChartContainer>
                {failed ? (
                    <ChartLoading>{noDataLabel}</ChartLoading>
                ) : isPrerender ? null : (
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                            data={data}
                            title={title}
                            margin={{ top: 8, right: 8, bottom: 0, left: -8 }}
                        >
                            <CartesianGrid
                                vertical={false}
                                stroke={chrome.grid}
                            />
                            <XAxis
                                dataKey="date"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: chrome.tick }}
                                tickFormatter={formatDay}
                                minTickGap={24}
                            />
                            <YAxis
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: chrome.tick }}
                                tickFormatter={(value) => `${value}%`}
                                width={48}
                            />
                            <Tooltip
                                content={renderTooltip}
                                cursor={{ stroke: chrome.cursor, strokeWidth: 1 }}
                            />
                            {names.map((name, index) => (
                                <Line
                                    key={name}
                                    type="linear"
                                    dataKey={name}
                                    name={seriesLabel(name)}
                                    stroke={seriesColours[index]}
                                    strokeWidth={activeSeries === name ? 3 : 2}
                                    strokeOpacity={activeSeries && activeSeries !== name ? 0.18 : 1}
                                    dot={false}
                                    activeDot={{ r: 4, stroke: chrome.dotRing, strokeWidth: 2 }}
                                    isAnimationActive={false}
                                />
                            ))}
                        </LineChart>
                    </ResponsiveContainer>
                )}
            </ChartContainer>
            {!failed && names.length > 0 && (
                <SeriesLegend>
                    {names.map((name, index) => (
                        <li key={name}>
                            <SeriesButton
                                type="button"
                                aria-pressed={pinnedSeries === name}
                                $dimmed={!!activeSeries && activeSeries !== name}
                                onMouseEnter={() => onHover(name)}
                                onMouseLeave={() => onHover(null)}
                                onFocus={() => onHover(name)}
                                onBlur={() => onHover(null)}
                                onClick={() => onPin(name)}
                            >
                                <Swatch $color={seriesColours[index]} />
                                {seriesLabel(name)}
                            </SeriesButton>
                        </li>
                    ))}
                </SeriesLegend>
            )}
        </>
    );
};

export default TrendChart;
