# Pokemon TCG Pocket Deck Tier List

<div align="center">

[![CI](https://img.shields.io/github/actions/workflow/status/PocketDecks/pokemon-tcg-pocket-tier-list/ci.yml?branch=main)](https://github.com/PocketDecks/pokemon-tcg-pocket-tier-list/actions/workflows/ci.yml)
[![licence](https://img.shields.io/github/license/PocketDecks/pokemon-tcg-pocket-tier-list)](LICENSE)

<img width="1677" alt="Tiered list of Pokémon TCG Pocket deck archetypes from S to E, with card icons for each deck" src="https://github.com/user-attachments/assets/76cb84ed-d0b0-44a6-a914-a3586c30449b" />

</div>

[PocketDecks.top](https://pocketdecks.top) publishes tier rankings for Pokémon TCG Pocket. The site builds them from tournament results and shows deck statistics and card data for each deck.

## 🚀 Quick start

Use the Node version in `.nvmrc` and Yarn 1. Install the root and analysis dependencies separately:

```bash
git clone https://github.com/PocketDecks/pokemon-tcg-pocket-tier-list.git
cd pokemon-tcg-pocket-tier-list
yarn install
cd analysis && yarn install && cd ..
yarn start
```

The development server runs at `http://localhost:3000`.

## ✨ Features

- The tier list at `/tier-list` ranks decks and links each entry to a deck page.
- The deck finder at `/deck` builds a deck from the cards you select and shows its statistics.
- The card list at `/cards-list` shows the card data the deck pages use.
- The expansion list at `/expansion-list` lets you browse sets and packs.
- Statistics at `/statistics` shows game counts, trends and matchups.
- The feedback page at `/feedback` lets signed-in visitors send a message.

## 💾 Data sources

Tournament results come from [Limitless](https://limitlesstcg.com/). Card data comes from [pokemon-tcg-pocket-cards](https://github.com/PocketDecks/pokemon-tcg-pocket-cards). The pipeline in `analysis/` turns the tournament results into the JSON files under `public/data/`.

## 📚 Documentation and contributing

- [Documentation index](docs/README.md) lists the guides.
- [Contributing guide](CONTRIBUTING.md) covers setup, checks and commit rules.

## 🌐 Translations

Locale files live in `src/locales/`, and a parity test checks them. To add a language, follow [How to add a language](docs/how-to/adding-a-language.md).

## 📜 Licence

The project uses the [AGPL-3.0 licence](https://www.gnu.org/licenses/agpl-3.0.html). See [LICENSE](LICENSE) for the full text.

## 🙏🏻 Acknowledgements

See [ACKNOWLEDGEMENTS.md](ACKNOWLEDGEMENTS.md) for the people and sources behind the project.
