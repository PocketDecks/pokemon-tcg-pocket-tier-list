import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { META_WINDOW_LENGTH_DAYS } from "../../app/meta-window";
import { useMetaWindow } from "../../app/use-meta-window";
import usePipelineTrends from "../../app/use-pipeline-trends";
import { deckDisplayName } from "../../app/deck-display";
import type { FullDeckType } from "../../app/deck-types";
import { formatTrendDay } from "./format-trend-day";
import TrendChart from "./TrendChart";
import { Section, SectionHeader, SectionTitle } from "./stats-section.styles";

const DAY_MS = 24 * 60 * 60 * 1000;

const TrendsSection = ({ decks }: { decks: FullDeckType[] }) => {
    const { t, i18n } = useTranslation();
    const { window: metaWindow } = useMetaWindow();
    const { rows, failed } = usePipelineTrends();
    const [hoveredSeries, setHoveredSeries] = useState<string | null>(null);
    const [pinnedSeries, setPinnedSeries] = useState<string | null>(null);

    const visibleRows = useMemo(() => {
        if (!rows.length) return [];
        const days = META_WINDOW_LENGTH_DAYS[metaWindow];
        if (days === null) return rows;

        // Anchored on the newest data, not the wall clock. Spans N calendar
        // days; zero-deck days are absent from the rows, so slices can be short.
        const newest = new Date(rows[rows.length - 1].date).getTime();
        const cutoff = newest - (days - 1) * DAY_MS;
        return rows.filter((row) => new Date(row.date).getTime() >= cutoff);
    }, [rows, metaWindow]);

    const seriesNames = rows.length > 0 ? Object.keys(rows[0]).filter((key) => key !== "date") : [];

    return (
        <Section>
            <SectionHeader>
                <SectionTitle>{t("statistics.trends")}</SectionTitle>
            </SectionHeader>

            <TrendChart
                data={visibleRows}
                names={seriesNames}
                title={t("statistics.trends")}
                failed={failed}
                noDataLabel={t("statistics.noTrends")}
                activeSeries={hoveredSeries ?? pinnedSeries}
                pinnedSeries={pinnedSeries}
                formatDay={(value) => formatTrendDay(value, i18n.language)}
                seriesLabel={(name) => deckDisplayName(decks.find((d) => d.name === name) ?? { name })}
                onHover={setHoveredSeries}
                onPin={(name) => setPinnedSeries((current) => (current === name ? null : name))}
            />
        </Section>
    );
};

export default TrendsSection;
