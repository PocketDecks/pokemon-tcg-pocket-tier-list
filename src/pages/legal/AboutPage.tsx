import LegalPage from "./LegalPage";
import { GITHUB_URL, CONTACT_EMAIL } from "../../app/constants";

const AboutPage = () => {
  return (
      <LegalPage>
          <h1>About Top Pocket Decks</h1>

          <p>
              Top Pocket Decks is a free, data-driven Pokémon TCG Pocket (PTCGP) deck tier list and
              deck-building tool. It ranks decks with tournament results, win rates,
              participation data, and top-cut performance, rather than opinion.
          </p>

          <h2>Pokémon TCG Pocket deck rankings</h2>
          <p>
              The tier list ranks current decks from S to F tier and updates as new
              tournament data becomes available. This helps players follow the
              current meta and choose decks with strong tournament support.
          </p>
          <h2>Tools for players</h2>
          <ul>
              <li>
                  <strong>Tier list:</strong>{" "}
                  <a href="/">View the current Pokémon TCG Pocket deck tier list</a>,
                  ranked from S to F tier.
              </li>
              <li>
                  <strong>Best Deck Finder:</strong> Mark the cards you are missing
                  and see the strongest deck you can build with your collection.
              </li>
              <li>
                  <strong>Matchups:</strong> See which decks each deck performs well
                  or poorly against, with win-rate percentages.
              </li>
              <li>
                  <strong>Best cards:</strong> Explore card-level rankings across
                  expansions.
              </li>
          </ul>

          <h2>Data sources and ranking method</h2>
          <p>
              Tournament data comes from{" "}
              <a
                  href="https://limitlesstcg.com/"
                  target="_blank"
                  rel="noopener noreferrer"
              >
                  Limitless
              </a>
              . The ranking model weighs tournament participation, win rates, and
              top-cut performance. Card data comes from the open-source{" "}
              <a
                  href="https://github.com/chase-manning/pokemon-tcg-pocket-cards"
                  target="_blank"
                  rel="noopener noreferrer"
              >
                  pokemon-tcg-pocket-cards
              </a>{" "}
              project.
          </p>

          <h2 id="premium">Premium</h2>
          <p>
              <strong>The core tools are free.</strong> An optional Premium subscription removes ads
              and adds features such as detailed matchups, advanced filters,
              alternative rankings, more decks, and faster updates.
          </p>

          <h2>Open source</h2>
          <p>
              Top Pocket Decks is open source. You can review the code on{" "}
              <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
                  GitHub
              </a>
              .
          </p>

          <h2>Contact</h2>
          <p>
              Send questions, feedback, or feature requests to{" "}
              <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </p>

          <p>
              "Top Pocket Decks" is a fan-made project and is not affiliated with,
              endorsed by, or sponsored by Nintendo, The Pokémon Company, Creatures
              Inc., GAME FREAK Inc., or DeNA. All trademarks belong to their owners.
          </p>
      </LegalPage>
  );
};

export default AboutPage;
