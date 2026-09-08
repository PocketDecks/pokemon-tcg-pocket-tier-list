# Pokemon TCG Pocket Deck Tier List

<div align="center">

[![frontend tests](https://img.shields.io/github/actions/workflow/status/chase-mew/pokemon-tcg-pocket-tier-list/frontend-tests.yml?branch=main)](https://github.com/chase-mew/pokemon-tcg-pocket-tier-list/actions/workflows/frontend-tests.yml)
[![analysis tests](https://img.shields.io/github/actions/workflow/status/chase-mew/pokemon-tcg-pocket-tier-list/analysis-tests.yml?branch=main)](https://github.com/chase-mew/pokemon-tcg-pocket-tier-list/actions/workflows/analysis-tests.yml)
[![licence](https://img.shields.io/github/license/chase-mew/pokemon-tcg-pocket-tier-list)](LICENSE)
[![node](https://img.shields.io/badge/node-24.18.1-green)](https://nodejs.org)
[![card data size](https://img.shields.io/badge/card%20data-453.9%20kB%20gzipped-blue)](https://bundlephobia.com/package/pokemon-tcg-pocket-cards@5.3.0)

<img width="1677" alt="image" src="https://github.com/user-attachments/assets/76cb84ed-d0b0-44a6-a914-a3586c30449b" />

</div>

A web application that tracks and displays the current best decks for the Pokémon TCG Pocket game. This project aims to help players stay informed about the competitive meta by analysing tournament data from [Limitless](https://limitlesstcg.com/) Tournaments.

## ✨ Features

- Real-time deck tier rankings based on tournament performance
- Detailed deck statistics and win rates
- Easy-to-use interface for browsing top decks
- Regular updates based on tournament results
- Mobile-friendly design

## 🚀 Getting Started

### Prerequisites

- Node.js 24.18.1, the version the CI workflows pin. The analysis pipeline needs at least Node 18 for global `fetch`.
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone https://github.com/chase-mew/pokemon-tcg-pocket-tier-list.git
cd pokemon-tcg-pocket-tier-list
```
2. Install frontend dependencies at the repo root, and analysis dependencies separately:
```bash
yarn install
cd analysis && yarn install && cd ..
```
3. Start the development server:
```bash
yarn start
```
4. Open your browser and navigate to `http://localhost:3000`

## 📚 Documentation

The site relies on a data analysis pipeline located in the `analysis/` directory. Maintainers use this pipeline to download tournaments, name decks, score them, and write the JSON files that power the frontend.     

Detailed documentation for maintaining the project is available in the `docs/` directory:
- **[Tutorial: Running a local pipeline update](docs/tutorial/running-pipeline-updates.md)**: Step-by-step instructions for fetching data and generating the frontend JSON files.
- **[How-to guide: Updating archetypes and expansions](docs/how-to/updating-archetypes-and-expansions.md)**: Instructions for modifying the archetype matcher and rolling over the pipeline for a new set release.
- **[Explanation: Statistical scoring and recency weighting](docs/explanation/statistical-scoring.md)**: The math behind the tier list, including the Wilson shrinkage estimator and recency multipliers.
- **[Reference: Analysis pipeline](docs/reference/analysis-pipeline.md)**: A technical overview of the backend data flow and scripting architecture.
- **[How-to guide: Running the frontend checks](docs/how-to/running-frontend-checks.md)**: Running the type, lint and test checks locally, and what CI runs on a pull request.
- **[Reference: Card data](docs/reference/card-data-contract.md)**: How the upstream card payload is normalised, what each field means, and how the app handles ids that fall out of step.
- **[Reference: Frontend architecture](docs/reference/frontend-architecture.md)**: The provider stack, routing, contexts, query keys and pure helpers behind the React app.
- **[Reference: Pipeline output contract](docs/reference/pipeline-output-contract.md)**: The five JSON files under `public/data/`, what each field means, and which pipeline scripts write and frontend components read them.
- **[How-to guide: Deploying and hosting](docs/how-to/deploying-and-hosting.md)**: What `yarn build` runs stage by stage, how Firebase Hosting caches and rewrites requests, and which workflow deploys on a pull request or merge.
- **[How-to guide: Adding a language](docs/how-to/adding-a-language.md)**: Steps for contributing a new locale, from choosing the BCP 47 code to passing the translation parity test.
- **[Explanation: Advertising, premium and consent](docs/explanation/ads-premium-and-consent.md)**: Why the site gates content and shows ads, how premium status resolves through Stripe subscription states, and how the ad and consent layers stay inside policy.

## 🙌 Contributing

We welcome contributions to improve this project:

1. Fork the repository
2. Create a new branch for your feature (`git checkout -b feature/AmazingFeature`)
3. Make your changes
4. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
5. Push to the branch (`git push origin feature/AmazingFeature`)
6. Open a Pull Request

Ensure your code follows the existing style and conventions. Add appropriate tests for new features and update documentation as needed. Keep commits focused and atomic.

## 🌐 Translations

Accessibility matters. This project supports multiple languages. The translation system uses JSON files to manage localised content.

To contribute a new language, follow the [how-to guide for adding a language](docs/how-to/adding-a-language.md). A parity test fails `yarn test:ci` when a locale file is missing keys the English file has, or carries keys the English file no longer has.

## 💾 Data sources

This project uses two data sources:

1. Tournament data from **[Limitless](https://limitlesstcg.com/)**, a platform for Pokémon TCG tournaments.    
The deck rankings and statistics are based on tournament participation rates, win rates, top cut appearances, and overall performance.
2. Card data from **[pokemon-tcg-pocket-cards](https://github.com/chase-manning/pokemon-tcg-pocket-cards)**, an open-source repository that provides card information for Pokémon TCG Pocket.   
_This data is used to display detailed card information and deck compositions._

## 📜 Licence

This project is licensed under the **[AGPL-3.0 License](https://www.gnu.org/licenses/agpl-3.0.html)**. See the **[LICENSE](LICENSE)** file for details.

## 🙏🏻 Acknowledgements

- [Limitless](https://limitlesstcg.com/) for providing tournament data
- [pokemon-tcg-pocket-cards](https://github.com/chase-manning/pokemon-tcg-pocket-cards) for maintaining the card database
- The Pokémon TCG community for their support and feedback
- All contributors who help improve this project