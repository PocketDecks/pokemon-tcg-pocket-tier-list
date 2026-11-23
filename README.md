# Pokémon TCG Pocket Deck Tier List

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

- A tournament-driven tier list ranks decks and shows the decklist behind each tier.
- A missing-cards finder starts from the top deck. Mark the cards you lack, and it shows the strongest deck you can still build.
- Filters narrow the deck list by Energy type or to decks with no ex cards.
- Matchup data shows which decks beat others and their win rates.
- Every deck page offers a QR code to scan into Pokémon TCG Pocket and a deck code to copy.
- Meta statistics show each deck's share of the field week by week and its head-to-head win rates.
- A card tier list groups cards into tiers and can be filtered by expansion.
- An expansion page lists the set's cards that appear in current tournament decks and the decks that play them.

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
