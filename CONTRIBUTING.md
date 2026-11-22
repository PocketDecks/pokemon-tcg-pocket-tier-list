# Contributing

Changes reach `main` through a pull request. A repository ruleset blocks direct pushes to `main`, so create a branch for your work and target `main` with the pull request.

## Set up

Install the Node version in `.nvmrc` and Yarn 1. Yarn 1 reads `yarn.lock`, which is the lockfile this repository keeps; npm would ignore it. Install the root and analysis dependencies separately:

```bash
yarn install
cd analysis
yarn install
```

[The documentation index](docs/README.md) links the guides for the pipeline, the data contracts and the site architecture.

## Before you open a pull request

Run the checks locally:

```bash
yarn typecheck
yarn lint
yarn test:ci
yarn test:scripts
```

[How to run the frontend checks](docs/how-to/running-frontend-checks.md) explains what each check covers and what CI runs on a pull request. Add tests for behaviour changes, and update the relevant guide when you change a workflow or a data contract.

## Commit and pull request titles

Use Conventional Commits for commit subjects and for the pull request title. Do not use `ci` as a type. The allowed types are feat, fix, refactor, perf, style, test, docs, build, ops and chore.

```
<type>: <description>
```

Write the description in the imperative present tense, with no leading capital and no trailing full stop. The pull request title becomes the squash commit subject, so it must follow the same form.

## Issues and other routes

Use one of the three issue forms. Application bug covers the site, Data or pipeline defect covers a published value or artefact, and Improvement or policy change covers new behaviour or a rule change. Do not open a public issue for a security problem; [SECURITY.md](SECURITY.md) gives the private route. For translations, follow [How to add a language](docs/how-to/adding-a-language.md). The [Code of Conduct](CODE_OF_CONDUCT.md) applies to all participation, and the project uses the [AGPL-3.0 licence](LICENSE).
