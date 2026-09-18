import useCards from "../../app/use-cards";
import useFilters from "../../app/use-filters";
import useExpansions, { ExpansionType } from "../../app/use-expansions";
import Dropdown from "../../components/Dropdown";
import SeoContent from "../../components/SeoContent";
import { useMarkContentReady } from "../../ads/ContentReadyContext";
import React, { type ChangeEvent } from "react";
import TierGrid from "../../components/TierGrid";
import UserAccount from "../../components/UserAccount";
import CardIcon from "../../components/CardIcon";
import LastUpdated from "../../components/LastUpdated";

const CardsListPage = () => {
  const cards = useCards(30);
  const { expansion, setExpansion } = useFilters();
  const expansions = useExpansions();

  const ready = !!cards && cards.length > 0;
  useMarkContentReady(ready);

  const filters = (
    <>
      <UserAccount />
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
        <h2>Pokémon TCG Pocket | Card Tier List</h2>
        <p>
          This tier list ranks individual cards in Pokémon TCG Pocket based on their
          contribution to winning decks. Instead of guessing which Pokémon and Trainer
          cards are worth pulling or crafting, you can see exactly which cards appear
          most frequently in the strongest tournament decks.
        </p>

        <h3>Calculating card scores</h3>
        <p>
          A card's score comes directly from the performance and popularity of the
          decks it appears in. Cards central to multiple high-tier archetypes earn the
          highest ratings. Cards that see little competitive play settle lower. You
          can filter the list by expansion to evaluate a specific set before spending
          your pack points or wonder picks.
        </p>

        <h3>Using the card rankings</h3>
        <p>
          Pair this list with the <a href="/tier-list">deck tier list</a> and the Best
          Deck Finder to plan your collection. This helps you prioritise high-tier
          cards that unlock competitive decks and avoid spending resources on cards
          with minimal impact. The card rankings refresh automatically alongside the
          deck data.
        </p>
      </SeoContent>
    </>
  );
};

export default CardsListPage;