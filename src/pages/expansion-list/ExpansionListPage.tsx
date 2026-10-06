import useCards from "../../app/use-cards";
import useExpansions from "../../app/use-expansions";
import SeoContent from "../../components/SeoContent";
import { useMarkContentReady } from "../../ads/ContentReadyContext";
import TierGrid from "../../components/TierGrid";
import ExpansionIcon from "../../components/ExpansionIcon";
import { buildExpansionPackData } from "../../app/expansion-scores";

const ExpansionListPage = () => {
  const cards = useCards(1_000_000);
  const expansions = useExpansions();

  useMarkContentReady(!!cards && !!expansions);

  const expansionData = buildExpansionPackData(cards ?? [], expansions ?? []);

  return (
      <>
        <TierGrid
          items={cards && expansions ? expansionData : null}
          getScore={(d) => d.averageScore}
          getKey={(d) => d.packId}
          renderItem={(data) => <ExpansionIcon image={data.packImage} />}
        />
        <SeoContent>
          <h2>Pokémon TCG Pocket | Best Expansions to Open</h2>
                  <p>
                    This page ranks booster packs by the competitive value of the cards
                    inside them. The scoring comes from real tournament data, not set
                    hype: a pack scores well when the cards you can pull from it appear
                    often in the strongest decks. That makes this list a reliable guide
                    for deciding which packs to open next.
                  </p>

                  <h3>How pack value is calculated</h3>
                  <p>
                    Every card carries a score based on how much tournament-winning decks
                    rely on it. Packs are ranked by the average score of their scored cards,
                    so consistently strong cards rank above packs with lower average value.
                    Cards that arrive through a set's shared pool count toward every pack
                    in that set. Once the averages are calculated, packs are sorted into
                    tiers from S to E, with S standing for the most valuable pulls in the
                    game.
                  </p>

                  <h3>Worth opening this week</h3>
                  <p>
                    The packs at the top of the list give you the most value per opening
                    because their cards carry over into the current meta directly. These
                    rankings assume a fresh collection, so they suit a new player who is
                    just starting out and has no cards to reuse. Even the lower tiers
                    hold useful cards, so the gap between tiers is a gap in how quickly a
                    card becomes competitive, not in usefulness. Pair this page with the{" "}
                    <a href="/tier-list">deck tier list</a> and the{" "}
                    <a href="/cards-list">card rankings</a> to see how the same scores
                    shape the strongest decks. Rankings refresh automatically alongside
                    the deck data.
                  </p>
        </SeoContent>
      </>
    );
};

export default ExpansionListPage;