import { useTranslation } from "react-i18next";
import { useDecks } from "../../app/use-decks";
import useFilters from "../../app/use-filters";
import useIsPremium from "../../app/use-is-premium";

import { SortBy } from "../../components/FilterContext";
import LastUpdated from "../../components/LastUpdated";
import Dropdown from "../../components/Dropdown";
import SeoContent from "../../components/SeoContent";
import AdInContent from "../../ads/AdInContent";
import { useMarkContentReady } from "../../ads/ContentReadyContext";
import React, { type ChangeEvent } from "react";
import TierGrid from "../../components/TierGrid";
import PageTitle from "../../components/PageTitle";
import DeckCard from "../../components/DeckCard";
import WindowToggle from "../../components/WindowToggle";
import styled from "styled-components";

const DeckAmountContainer = styled.label`
  display: flex;
  align-items: center;
  gap: 1.2rem;
  font-size: 1.4rem;
  color: var(--main);
`;

// Sits above LastUpdated, which owns the very bottom-right corner.
const WindowToggleCorner = styled.div`
  position: fixed;
  bottom: 5.4rem;
  right: 2rem;
  z-index: 10;

  @media (max-width: 900px) {
    position: static;
    margin: 1.6rem 2rem;
    display: flex;
    justify-content: flex-end;
  }
`;

const DeckAmountSelect = styled(Dropdown)`
  min-width: 8rem;
`;

const IncludeExContainer = styled.label`
  display: flex;
  align-items: center;
  font-size: 1.4rem;
  color: var(--main);
  cursor: pointer;
  user-select: none;
  gap: 0.8rem;
`;

const IncludeExCheckbox = styled.input.attrs({ type: "checkbox" })`
  width: 1.6rem;
  height: 1.6rem;
  accent-color: var(--f);
  background: var(--bg);
  border: 2px solid var(--main);
  border-radius: 0.3rem;
  margin-left: 0.8rem;
  cursor: pointer;
`;

const ENERGY_TYPES = [
  "Grass",
  "Fire",
  "Water",
  "Lightning",
  "Psychic",
  "Fighting",
  "Darkness",
  "Metal",
  "Dragon",
  "Colorless",
];

const TierListPage = () => {
  const { decks, metaShareBySlug, loading, error } = useDecks();
  const {
    energy,
    setEnergy,
    includeEx,
    setIncludeEx,
    deckAmount,
    setDeckAmount,
    sortBy,
    setSortBy,
    latestExpansionCards,
    setLatestExpansionCards,
  } = useFilters();
  const { t } = useTranslation();
  const isPremium = useIsPremium();

  const ready = !loading && !!decks && decks.length > 0;
  useMarkContentReady(ready);

  if (error)
    return (
      <>
        <WindowToggleCorner>
          <WindowToggle />
        </WindowToggleCorner>
        <div>Error loading data: {error.message}</div>
      </>
    );

  const filters = isPremium ? (
        <>
          <Dropdown
            value={energy ?? ""}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => {
              const value = e.target.value;
              setEnergy(value === "" ? null : value);
            }}
          >
            <option value="">{t("energyDropdown.all")}</option>
            {ENERGY_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`energyDropdown.${type}`)}
              </option>
            ))}
          </Dropdown>
          <IncludeExContainer>
            {t("filter.includeEx")}
            <IncludeExCheckbox
              type="checkbox"
              checked={includeEx}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setIncludeEx(e.target.checked)}
            />
          </IncludeExContainer>
          <DeckAmountContainer>
            {t("filter.deckAmount")}
            <DeckAmountSelect
              value={deckAmount}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setDeckAmount(Number(e.target.value))}
            >
              {[10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((amount) => (
                <option key={amount} value={amount}>
                  {amount}
                </option>
              ))}
            </DeckAmountSelect>
          </DeckAmountContainer>
          <DeckAmountContainer>
            {t("filter.sortBy")}
            <DeckAmountSelect
              value={sortBy}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSortBy(e.target.value as SortBy)}
            >
              {[SortBy.POWER, SortBy.META, SortBy.SCORE, SortBy.POPULARITY, SortBy.STRENGTH].map(
                (sortByOption) => (
                  <option key={sortByOption} value={sortByOption}>
                    {t(`filter.${sortByOption}`)}
                  </option>
                )
              )}
            </DeckAmountSelect>
          </DeckAmountContainer>
          <DeckAmountContainer>
            {t("filter.latestExpansionCards")}
            <DeckAmountSelect
              value={latestExpansionCards ?? ""}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                const value = e.target.value;
                setLatestExpansionCards(value === "" ? null : Number(value));
              }}
            >
              <option value="">{t("filter.latestExpansionCardsAny")}</option>
              {[2, 6, 12].map((count) => (
                <option key={count} value={count}>
                  {count}
                </option>
              ))}
            </DeckAmountSelect>
          </DeckAmountContainer>
        </>
  ) : null;

  return (
    <>
      <PageTitle>{t("header.tierList")}</PageTitle>
      <TierGrid
        items={decks ? decks.filter((deck) => deck.powerScore !== null) : null}
        getScore={(d) => d.powerScore ?? -1}
        getKey={(d) => d.id}
        renderItem={(deck) => (
          <DeckCard
            deck={deck}
            metaShare={metaShareBySlug?.[deck.id] ?? null}
            metaShareLabel={t("tierList.metaShare")}
          />
        )}
        filters={filters}
        footer={
          <>
            <AdInContent placement="tierList" mobileOnly />
            <LastUpdated />
          </>
        }
      />
      <WindowToggleCorner>
        <WindowToggle />
      </WindowToggleCorner>
      <SeoContent>
        <h2>{t("tierList.heading", { ns: "seo" })}</h2>
        <p>
          {t("tierList.intro", { ns: "seo" })}{" "}
          <a href="https://limitlesstcg.com/" target="_blank" rel="noopener noreferrer">
            {t("tierList.limitless", { ns: "seo" })}
          </a>{" "}
          {t("tierList.introAfter", { ns: "seo" })}
        </p>

        <h3>{t("tierList.calcHeading", { ns: "seo" })}</h3>
        <p>{t("tierList.calcBody", { ns: "seo" })}</p>

        <h3>{t("tierList.tiersHeading", { ns: "seo" })}</h3>
        <p>{t("tierList.tiersBody", { ns: "seo" })}</p>

        <h3>{t("tierList.buildHeading", { ns: "seo" })}</h3>
        <p>{t("tierList.buildBody", { ns: "seo" })}</p>

        <h3>{t("tierList.updatesHeading", { ns: "seo" })}</h3>
        <p>{t("tierList.updatesBody", { ns: "seo" })}</p>
      </SeoContent>
    </>
  );
};

export default TierListPage;