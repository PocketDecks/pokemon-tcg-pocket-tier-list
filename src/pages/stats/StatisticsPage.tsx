import styled from "styled-components";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { LocaleLink as Link } from "../../app/locale-link";
import usePipelineTrends from "../../app/use-pipeline-trends";
import SeoContent from "../../components/SeoContent";
import AdInContent from "../../ads/AdInContent";
import { useMarkContentReady } from "../../ads/ContentReadyContext";
import { useDecks } from "../../app/use-decks";
import { latestCoveredExpansion } from "../../app/use-expansions";
import PageTitle from "../../components/PageTitle";
import WindowToggle from "../../components/WindowToggle";
import MatrixSection from "./MatrixSection";
import MovementSection from "./MovementSection";
import TrendsSection from "./TrendsSection";
import { Loading } from "./stats-section.styles";

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

const ToggleRow = styled.div`
    display: flex;
    align-items: center;
    gap: 1.2rem;
    flex-wrap: wrap;

    @media (max-width: 600px) {
        width: 100%;
    }
`;

const StatisticsPage = () => {
    const { t } = useTranslation();
    const decksState = useDecks();
    const { decks, metaShare } = decksState;
    const trendQuery = usePipelineTrends();
    const newest = latestCoveredExpansion(decks);

    useMarkContentReady(decksState.status === "ready" && !trendQuery.isLoading);

    const decksById = useMemo(
        () => new Map((decks ?? []).map((d) => [d.id, d])),
        [decks]
    );

    // The static shell (header + SEO copy) renders even while deck data is in
    // flight. The build-time prerender snapshots this route with no network
    // data available, so returning early would ship a page whose only content
    // is "Loading..." to crawlers.
    const renderContent = () => {
        if (decksState.status === "loading") return <Loading>Loading...</Loading>;
        if (decksState.status === "error") {
            return <Loading>Error loading data: {decksState.error.message}</Loading>;
        }
        return (
            <>
                <TrendsSection decks={decksState.decks} />
                <AdInContent placement="statistics" />
                <MovementSection metaShare={metaShare} decksById={decksById} />
                <AdInContent placement="statistics" />
                <MatrixSection decks={decksState.decks} />
            </>
        );
    };

    return (
        <PageContainer>
            <PageTitle>{t("header.statistics")}</PageTitle>

            <ToggleRow>
                <WindowToggle />
            </ToggleRow>

            {renderContent()}

            <SeoContent>
                <h2>{t("statistics.heading", { ns: "seo" })}</h2>
                <p>
                    {newest
                        ? t("statistics.intro", { ns: "seo", expansion: newest.name })
                        : t("statistics.introGeneric")}
                </p>

                <h3>{t("statistics.trendsHeading", { ns: "seo" })}</h3>
                <p>{t("statistics.trendsBody", { ns: "seo" })}</p>
                <p>
                    {t("statistics.crossIntro", { ns: "seo" })}{" "}
                    <Link to="/tier-list">{t("statistics.tierListLink", { ns: "seo" })}</Link>{" "}
                    {t("statistics.crossAfter", { ns: "seo" })}
                </p>

                <h3>{t("statistics.matrixHeading", { ns: "seo" })}</h3>
                <p>{t("statistics.matrixBody", { ns: "seo" })}</p>
                <p>
                    {t("statistics.weakIntro", { ns: "seo" })}{" "}
                    <Link to="/deck">{t("statistics.deckFinderLink", { ns: "seo" })}</Link>{" "}
                    {t("statistics.weakAfter", { ns: "seo" })}
                </p>

                <h3>{t("gameCounts.title")}</h3>
                <p>{t("gameCounts.body")}</p>
            </SeoContent>
        </PageContainer>
    );
};

export default StatisticsPage;