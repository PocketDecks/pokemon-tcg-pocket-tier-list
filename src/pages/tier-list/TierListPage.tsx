import { useTranslation } from "react-i18next";
/* eslint-disable-next-line no-restricted-imports -- pre-existing: this page
   still consumes DecksContext directly. Move behind src/app/ before adding more. */
import { useDecks } from "../../contexts/DecksContext";
import useFilters from "../../app/use-filters";
import useIsPremium from "../../app/use-is-premium";

import UserAccount from "../../components/UserAccount";
import { SortBy } from "../../components/FilterContext";
import LastUpdated from "../../components/LastUpdated";
import Dropdown from "../../components/Dropdown";
import SeoContent from "../../components/SeoContent";
import AdInContent from "../../ads/AdInContent";
import { useMarkContentReady } from "../../ads/ContentReadyContext";
import React, { type ChangeEvent } from "react";
import TierGrid from "../../components/TierGrid";
import DeckCard from "../../components/DeckCard";
import styled from "styled-components";

const FilterContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  position: absolute;
  top: 2rem;
  right: 2rem;
  gap: 1.5rem;
  z-index: 10;

  @media (max-width: 900px) {
    position: relative;
    top: 0;
    right: 0;
    margin: 2rem;
    width: calc(100% - 4rem);
    justify-content: space-between;
    align-items: center;
  }
`;

const DeckAmountContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 1.2rem;
  font-size: 1.4rem;
  color: var(--main);
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
  accent-color: var(--e);
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

  if (error) return <div>Error loading data: {error.message}</div>;

  const filters = (
    <FilterContainer>
      <UserAccount />
      {isPremium && (
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
              {[SortBy.POWER, SortBy.SCORE, SortBy.POPULARITY, SortBy.STRENGTH].map(
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
      )}
    </FilterContainer>
  );

  return (
    <>
      <TierGrid
        items={decks}
        getScore={(d) => d.powerScore ?? -1}
        isRanked={(deck) => deck.powerScore !== null}
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
      <SeoContent>
        <h2>Pokémon TCG Pocket | Deck Tier List</h2>
        <p>
          This tier list ranks the best decks in Pokémon TCG Pocket using competitive
          results rather than opinion. We score every deck using tournament data from{" "}
          <a href="https://limitlesstcg.com/" target="_blank" rel="noopener noreferrer">
            Limitless
          </a>{" "}
          events and sort them into tiers from S to E. The list updates regularly to
          reflect the current metagame as new expansions and balance changes alter the
          format.
        </p>

        <h3>How we calculate deck rankings</h3>
        <p>
          Each deck's placement depends on how often it sees play, its tournament
          performance, and its win rate against the rest of the field. We aggregate
          decklists from recent tournaments and group them by archetype to calculate
          an overall score. Decks with high win rates and frequent top-cut appearances
          move into the S and A tiers. Fringe or underperforming decks drop to the
          lower tiers.
        </p>

        <h3>Understanding the tiers</h3>
        <p>
          The S tier contains the strongest and most consistent decks in the current
          meta, making them safe choices for ranked play. A and B tier decks are
          highly competitive and can win events in the right hands or with favourable
          matchups. C and D tier options remain viable but are less consistent, often
          serving as budget-friendly or matchup-dependent alternatives. E tier
          consists of experimental decks that struggle against the top of the meta.
        </p>

        <h3>Building your best deck</h3>
        <p>
          If you do not own every card, you can open any deck to view its full list
          alongside card-for-card alternatives. You can also use the Best Deck Finder
          to mark the cards you are missing and instantly find the strongest deck you
          can build with your current collection. The tool allows you to filter by
          energy type and rank decks by popularity or raw strength.
        </p>

        <h3>Tier list updates</h3>
        <p>
          The rankings update automatically as fresh tournament results come in. The
          fastest updates go to Premium members. The date shown in the lower-right corner
          always reflects the most recent refresh.
        </p>
      </SeoContent>
    </>
  );
};

export default TierListPage;