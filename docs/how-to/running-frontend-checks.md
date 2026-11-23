# How to run the frontend checks

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

`.github/workflows/ci.yml` is named `CI`. It runs on pushes to and pull requests
against `main`, and accepts manual dispatch. Four jobs provide the required
checks: `frontend`, `analysis`, `kofi` and `actionlint`. `frontend` checks
generated files, then runs root typecheck, lint, tests, script tests and
Firestore rules. `analysis` runs typecheck, tests and a second test pass with
`TMPDIR` pointing at a symlink to a real folder, which catches temp-root bugs
that only appear when a parent directory is a link. `kofi` runs its typecheck,
tests and the Wrangler dry-run bundle. `actionlint` downloads release v1.7.12,
checks the archive against a pinned SHA-256 hash and lints every workflow.
All four jobs use the Node version in `.nvmrc` through `.github/actions/setup`.
Their `timeout-minutes` limits are 15, 10, 10 and 5. The Firestore rules step
has its own five-minute limit.

Root `yarn lint` also covers `analysis/`.

The deploy and preview workflows run `yarn build:site`, which builds the site
without repeating typecheck or lint. `yarn build` still runs typecheck and lint
first, then calls `yarn build:site`. Both scripts run the same generation and
prerender hooks. Deploy starts only after a successful CI run, and the
`frontend` job in CI runs lint with `--max-warnings 0`, so a warning you ignore
locally still stops a deployment.

Third-party actions are pinned to full commit SHAs with version comments.
Dependabot reads those comments, so apply its updates without changing the
comment format.

## Upgrading packages

The root and analysis npm entry targets `main` for version updates. Its `allow`
list limits version pull requests to `pokemon-tcg-pocket-cards`.

GitHub ignores options in an entry with `target-branch` for security updates.
Security updates use the repository default branch, so the version-update
`allow` list does not filter them. Dependabot can open security pull requests
for vulnerable packages in both directories. The separate `/workers/kofi` npm
entry keeps its weekly grouped version updates

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
