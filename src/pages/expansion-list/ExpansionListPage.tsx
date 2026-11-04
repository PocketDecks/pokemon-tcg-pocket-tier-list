import useCards from "../../app/use-cards";
import useExpansions from "../../app/use-expansions";
import SeoContent from "../../components/SeoContent";
import { useMarkContentReady } from "../../ads/ContentReadyContext";
import { useTranslation } from "react-i18next";
import TierGrid from "../../components/TierGrid";
import PageTitle from "../../components/PageTitle";
import ExpansionIcon from "../../components/ExpansionIcon";
import { buildExpansionPackData } from "../../app/expansion-scores";
import { useLocaleHref, LocaleLink } from "../../app/locale-link";

const ExpansionListPage = () => {
  const { t } = useTranslation();
  const tierListHref = useLocaleHref("/tier-list");
  const cardsListHref = useLocaleHref("/cards-list");
  const cards = useCards(1_000_000);
  const expansions = useExpansions();

  useMarkContentReady(!!cards && !!expansions);

  const expansionData = buildExpansionPackData(cards ?? [], expansions ?? []);
  const expansionPageHref = (id: string) => `/expansion-list/${id}`;

  return (
      <>
        <PageTitle>{t("header.bestExpansions")}</PageTitle>
        <TierGrid
          items={cards && expansions ? expansionData : null}
          getScore={(d) => d.averageScore}
          getKey={(d) => d.packId}
          renderItem={(data) => (
            <LocaleLink to={expansionPageHref(data.expansionId)}>
              <ExpansionIcon image={data.packImage} />
            </LocaleLink>
          )}
        />
        <SeoContent>
          <h2>{t("expansionList.heading", { ns: "seo" })}</h2>
                  <p>{t("expansionList.intro", { ns: "seo" })}</p>

                  <h3>{t("expansionList.valueHeading", { ns: "seo" })}</h3>
                  <p>{t("expansionList.valueBody", { ns: "seo" })}</p>

                  <h3>{t("expansionList.worthHeading", { ns: "seo" })}</h3>
                  <p>
                    {t("expansionList.worthIntro", { ns: "seo" })}{" "}
                    <a href={tierListHref}>{t("expansionList.deckTierList", { ns: "seo" })}</a>{" "}
                    {t("expansionList.worthMid", { ns: "seo" })}{" "}
                    <a href={cardsListHref}>{t("expansionList.cardRankings", { ns: "seo" })}</a>{" "}
                    {t("expansionList.worthAfter", { ns: "seo" })}
                  </p>
        </SeoContent>
      </>
    );
};

export default ExpansionListPage;