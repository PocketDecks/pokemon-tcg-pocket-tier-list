# Pokemon TCG Pocket Deck Tier List

[![CI](https://img.shields.io/github/actions/workflow/status/chase-mew/pokemon-tcg-pocket-tier-list/ci.yml?branch=main)](https://github.com/chase-mew/pokemon-tcg-pocket-tier-list/actions/workflows/ci.yml)
[![licence](https://img.shields.io/github/license/chase-mew/pokemon-tcg-pocket-tier-list)](LICENSE)
[![card data size](https://img.shields.io/badge/card%20data-453.9%20kB%20gzipped-blue)](https://bundlephobia.com/package/pokemon-tcg-pocket-cards@5.3.0)

<img width="1677" alt="image" src="https://github.com/user-attachments/assets/76cb84ed-d0b0-44a6-a914-a3586c30449b" />

[PocketDecks.top](https://pocketdecks.top) publishes tier rankings for Pokémon TCG Pocket. The site builds them from tournament results and shows deck statistics and card data for each deck. Rankings refresh four times a week, so a page can lag the latest tournament by a few days.

## Quick start

Use the Node version in `.nvmrc` and Yarn 1. Install the root and analysis dependencies separately:

```bash
git clone https://github.com/PocketDecks/pokemon-tcg-pocket-tier-list.git
cd pokemon-tcg-pocket-tier-list
yarn install
cd analysis && yarn install && cd ..
yarn start
```

The development server runs at `http://localhost:3000`.

## Data sources

Tournament results come from [Limitless](https://limitlesstcg.com/). Card data comes from [pokemon-tcg-pocket-cards](https://github.com/PocketDecks/pokemon-tcg-pocket-cards). The pipeline in `analysis/` turns the tournament results into the JSON files under `public/data/`.

## Documentation and contributing

- [Documentation index](docs/README.md) lists all 17 guides.
- [Contributing guide](CONTRIBUTING.md) covers setup, checks and commit rules.

## Translations

Locale files live in `src/locales/`, and a parity test checks them. The documentation index links the guide for adding a language.

## Licence

The project uses the [AGPL-3.0 licence](https://www.gnu.org/licenses/agpl-3.0.html). See [LICENSE](LICENSE) for the full text.
