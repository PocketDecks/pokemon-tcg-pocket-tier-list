import useCards from "../../app/use-cards";
import useFilters from "../../app/use-filters";
import useExpansions, { ExpansionType } from "../../app/use-expansions";
import Dropdown from "../../components/Dropdown";
import SeoContent from "../../components/SeoContent";
import { useMarkContentReady } from "../../ads/ContentReadyContext";
import { type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import TierGrid from "../../components/TierGrid";
import PageTitle from "../../components/PageTitle";
import CardIcon from "../../components/CardIcon";
import LastUpdated from "../../components/LastUpdated";
import { useLocaleHref } from "../../app/locale-link";

const CardsListPage = () => {
  const { t } = useTranslation();
  const tierListHref = useLocaleHref("/tier-list");
  const cards = useCards(30);
  const { expansion, setExpansion } = useFilters();
  const expansions = useExpansions();

  const ready = !!cards && cards.length > 0;
  useMarkContentReady(ready);

  const filters = (
    <>
      <Dropdown
        value={expansion ?? ""}
        onChange={(e: ChangeEvent<HTMLSelectElement>) => {
          const value = e.target.value;
          setExpansion(value === "" ? null : value);
        }}
      >
        <option value="">All</option>
        {expansions?.map((expansion: ExpansionType) => (
          <option key={expansion.id} value={expansion.id}>
            {expansion.name}
          </option>
        ))}
      </Dropdown>
    </>
  );

  return (
    <>
      <PageTitle>{t("header.bestCards")}</PageTitle>
      <TierGrid
        items={cards}
        getScore={(c) => c.score}
        getKey={(c) => c.id}
        renderItem={(card) => <CardIcon card={card} />}
        filters={filters}
        footer={<LastUpdated />}
        emptyLabel="No cards found"
      />
      <SeoContent>
        <h2>{t("cardsList.heading", { ns: "seo" })}</h2>
        <p>{t("cardsList.intro", { ns: "seo" })}</p>

        <h3>{t("cardsList.scoresHeading", { ns: "seo" })}</h3>
        <p>{t("cardsList.scoresBody", { ns: "seo" })}</p>

        <h3>{t("cardsList.usingHeading", { ns: "seo" })}</h3>
        <p>
          {t("cardsList.usingIntro", { ns: "seo" })}{" "}
          <a href={tierListHref}>{t("cardsList.deckTierList", { ns: "seo" })}</a>{" "}
          {t("cardsList.usingAfter", { ns: "seo" })}
        </p>
      </SeoContent>
    </>
  );
};

export default CardsListPage;