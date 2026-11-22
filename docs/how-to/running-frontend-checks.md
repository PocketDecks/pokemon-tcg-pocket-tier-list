# How-to guide: Running the frontend checks

The frontend has three checks: types, lint and tests. CI runs all three on
every pull request, so running them locally first saves a round trip.

## Running everything

Install the root dependencies once, then run the checks in the order CI uses.
```bash
yarn install
yarn typecheck
yarn lint
yarn test:ci
```
`yarn typecheck` runs `tsc --noEmit` over `src/`. `yarn lint` runs ESLint with
`--max-warnings 0`, so a warning fails the run exactly as an error does.
`yarn test:ci` runs the Vitest suites once instead of staying in watch mode.

Use `yarn test` while you are working. It watches your files and re-runs only
the affected suites.

## What CI runs

`.github/workflows/frontend-tests.yml` installs with `--frozen-lockfile`, then
runs typecheck, lint and tests against Node 24.22.1. It triggers on pull
requests to `main` and on pushes to `main`. The analysis pipeline has its own
workflow in `analysis-tests.yml`, which does not cover `src/`.
Root `yarn lint` also covers `analysis/`.

The deploy workflows run `yarn build` separately. That script chains
typecheck and lint ahead of `vite build`, so a warning you ignore locally
will still stop a deployment.

## Upgrading packages

The root and analysis npm update entry opens version pull requests only for
`pokemon-tcg-pocket-cards`. Dependabot also opens one grouped weekly pull
request for GitHub Actions. The separate `/workers/kofi` npm entry keeps its
weekly grouped updates.

GitHub's Dependabot options say the `allow` setting limits which dependencies
are maintained for version and security updates. The root and analysis allow
list therefore limits npm security pull requests to
`pokemon-tcg-pocket-cards`. Other vulnerable npm packages in those directories
will not get Dependabot pull requests under this configuration. The owner must
change the allow list to include them.

An upgrade outside these configured entries is done by hand, when the owner
chooses to.

## Adding a test

Tests live in a `__tests__` directory beside the code they cover, which
matches the layout the analysis pipeline already uses.
```text
src/app/__tests__/          deck-filters, cards-api, tier-helper, sorting-helper
src/components/__tests__/   ErrorBoundary
src/contexts/__tests__/     DecksContext
```
Shared fixtures go in `src/app/__fixtures__/`. The card fixture there holds
three records copied from the live dataset: a Pokémon, a Trainer and an ex
Pokémon.

Prefer testing the pure helpers in `src/app/` over rendering components. The
predicates in `deck-filters.ts` take plain arguments and return booleans, so
they need no React and no network.

## Testing code that fetches

`DecksContext` and `useCards` both read from the card dataset. Stub `fetch`
rather than reaching the network, and mock `use-is-premium`, which is the only
dependency that pulls in Firebase. `src/contexts/__tests__/DecksContext.test.tsx`
shows the pattern.

## Troubleshooting

**The build reports a type error that `yarn typecheck` does not.** These
should no longer diverge: `yarn build` runs the same `tsc --noEmit` first.
If you still see a difference, check for a stray `tsconfig` override.

**Lint passes locally but the deploy fails.** Check that you ran `yarn lint`
and not just the editor's ESLint integration. The `--max-warnings 0` flag is
what makes warnings fatal.
