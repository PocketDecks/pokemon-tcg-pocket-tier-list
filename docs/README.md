# Documentation

These guides cover the site, the analysis pipeline and the data contracts behind the tier list. Start with the tutorial when you want to run the pipeline locally. Use the how-to guides for a single task, the reference pages for field and behaviour details, and the explanations for the reasoning behind the scoring and the content rules.

## Tutorial

- [Tutorial: Running a local pipeline update](tutorial/running-pipeline-updates.md) - How do I fetch tournament data and rebuild the deck JSON files locally?

## How-to guides

- [How to add a language](how-to/adding-a-language.md) - How do I contribute a new locale and pass the parity test?
- [How to collect feedback](how-to/collecting-feedback.md) - How does the sign-in-only feedback page store a submission?
- [How to deploy and host](how-to/deploying-and-hosting.md) - What runs on a pull request or a push to main, and how does Hosting serve the build?
- [How to publish premium window data](how-to/publish-premium-data.md) - How do I release protected data to Premium subscribers?
- [How to receive Ko-fi payments](how-to/receive-ko-fi-payments.md) - How does a Ko-fi payment grant Premium time?
- [How to refresh the pinned robots list](how-to/refreshing-the-robots-list.md) - How do I update the crawler list and regenerate the robots file?
- [How to report and triage](how-to/reporting-and-triage.md) - Which issue form should I use, and how do maintainers triage it?
- [How to run the frontend checks](how-to/running-frontend-checks.md) - Which checks must pass before I open a pull request?
- [How to run the scheduled refresh](how-to/running-the-scheduled-refresh.md) - How does the scheduled refresh publish reviewed outputs?
- [How to update archetypes and expansions](how-to/updating-archetypes-and-expansions.md) - How do I add a set or change an archetype match?

## Reference

- [Analysis pipeline reference](reference/analysis-pipeline.md) - Which scripts move tournament data into the published JSON files?
- [Card data reference](reference/card-data-contract.md) - What fields does the upstream card data provide?
- [Deck share codes reference](reference/deck-share-codes.md) - How is a deck encoded in a shareable URL?
- [Frontend architecture reference](reference/frontend-architecture.md) - How are the React providers, routes and query keys arranged?
- [Pipeline output contract reference](reference/pipeline-output-contract.md) - Which data files does the frontend read, and who writes them?

## Explanation

- [Explanation: Advertising, premium and consent](explanation/ads-premium-and-consent.md) - Why does the site gate content and show ads?
- [Explanation: Statistical scoring and weighting](explanation/statistical-scoring.md) - How are decks scored and how is the scoring window chosen?
