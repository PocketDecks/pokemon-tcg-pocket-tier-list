import useCards from "../../app/use-cards";
import useExpansions from "../../app/use-expansions";
import SeoContent from "../../components/SeoContent";
import { useMarkContentReady } from "../../ads/ContentReadyContext";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import TierGrid from "../../components/TierGrid";
import PageTitle from "../../components/PageTitle";
import ExpansionIcon from "../../components/ExpansionIcon";
import ExpansionStack from "../../components/ExpansionStack";
import SegmentedControl from "../../components/SegmentedControl";
import { buildExpansionData, buildExpansionPackData } from "../../app/expansion-scores";
import { packSlug } from "../../app/expansion-page-data";
import { useLocaleHref, LocaleLink } from "../../app/locale-link";

type ExpansionView = "expansions" | "packs";

const ExpansionListPage = () => {
  const { t } = useTranslation();
  const tierListHref = useLocaleHref("/tier-list");
  const cardsListHref = useLocaleHref("/cards-list");
  const cards = useCards(1_000_000, { ignoreExpansionFilter: true });
  const expansions = useExpansions();
  const [searchParams, setSearchParams] = useSearchParams();
  const view: ExpansionView = searchParams.get("view") === "packs" ? "packs" : "expansions";

  const ready = !!cards && !!expansions;
  useMarkContentReady(ready);

  const expansionData = buildExpansionData(cards ?? [], expansions ?? []);
  const packData = buildExpansionPackData(cards ?? [], expansions ?? []);
  const expansionName = (id: string) => expansions?.find((entry) => entry.id === id)?.name ?? id;

  const selectView = (next: ExpansionView) => {
    const params = new URLSearchParams(searchParams);
    if (next === "packs") params.set("view", "packs");
    else params.delete("view");
    setSearchParams(params, { replace: true });
  };

  const viewToggle = (
    <SegmentedControl<ExpansionView>
      label={t("expansionList.viewLabel")}
      value={view}
      options={[
        { value: "expansions", label: t("expansionList.viewExpansions") },
        { value: "packs", label: t("expansionList.viewPacks") },
      ]}
      onChange={selectView}
    />
  );

  return (
      <>
        <PageTitle>{t("header.bestExpansions")}</PageTitle>
        {view === "packs" ? (
          <TierGrid
            items={ready ? packData : null}
            getScore={(d) => d.averageScore}
            getKey={(d) => d.packId}
            renderItem={(data) => {
              const name = `${expansionName(data.expansionId)}: ${data.packName}`;
              const expansion = expansions?.find((entry) => entry.id === data.expansionId);
              const to =
                (expansion?.packs.length ?? 0) > 1
                  ? `/expansion-list/${data.expansionId}?pack=${packSlug(data.expansionId, data.packId)}`
                  : `/expansion-list/${data.expansionId}`;
              return (
                <LocaleLink to={to} aria-label={name}>
                  <ExpansionIcon image={data.packImage} alt="" />
                </LocaleLink>
              );
            }}
            filters={viewToggle}
          />
        ) : (
          <TierGrid
            items={ready ? expansionData : null}
            getScore={(d) => d.averageScore}
            getKey={(d) => d.expansionId}
            renderItem={(data) => (
              <LocaleLink to={`/expansion-list/${data.expansionId}`} aria-label={data.name}>
                {data.packImages.length > 1 ? (
                  <ExpansionStack images={data.packImages} />
                ) : (
                  <ExpansionIcon image={data.packImages[0]} alt="" />
                )}
              </LocaleLink>
            )}
            filters={viewToggle}
          />
        )}
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