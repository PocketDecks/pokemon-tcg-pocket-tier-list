# How to deploy and host

The site deploys itself. Pushing to `main` publishes to Firebase Hosting's live
channel; opening a pull request publishes a preview channel. You deploy by hand
only when testing the build path locally, which this guide also covers.

## What `yarn build` runs

Yarn's lifecycle hooks turn one command into a seven-stage pipeline. In order:

1. Sitemap generation. The `prebuild` hook runs
   `node scripts/generate-sitemap.js`, which rebuilds `public/sitemap.xml` from
   the eight static routes plus one entry per deck in
   `public/data/best-decks.json`. A typical run logs
   `Wrote 86 routes to ...\public\sitemap.xml`.
2. Typecheck. `yarn typecheck` runs `tsc --noEmit`.
3. Lint. `yarn lint` runs ESLint with `--max-warnings 0`.
4. Bundle. `vite build` transforms the app into `dist/`, emitting the stable
   `dist/app.js` application entry and hashed dependency chunks under
   `dist/assets/`.
5. Deck prerendering. `node scripts/prerender-decks.js` writes one
   `dist/deck/<slug>/index.html` per deck in `best-decks.json`, each stamped
   with Open Graph and Twitter meta plus BreadcrumbList JSON-LD.
6. Route prerendering. `node scripts/prerender-routes.js` serves `dist/` on
   `127.0.0.1:4173`, loads each static route in headless Chromium through
   Puppeteer, stamps per-route titles, descriptions and canonicals using
   `stampHead` in `scripts/meta-stamp.js`, and writes each result as
   `<route>/index.html`. It aborts third-party requests (ads, Firebase,
   fonts) but allows the external card database, because rendering gates on
   card data loading. Any page error fails the stage.
7. Dist verification. `node scripts/verify-dist-html.js` scans every built
   HTML file for `127.0.0.1` or `localhost` references and exits non-zero if
   any survive, since a leaked loopback URL would break the deployed page. It
   also fails when an inline script in the built HTML has no SHA-256 hash in
   the effective script policy of the enforced Content-Security-Policy
   header (see below).

Stages 5 to 7 form the `postbuild` hook, so they never run without stages 1 to
4 ahead of them. If a build stops after the Vite stage you have a stale `dist/`
with template HTML but no prerendered pages; rerun the whole command.

The first build downloads a Chromium build for Puppeteer. Later runs reuse it.

## How hosting serves the output

`firebase.json` points Hosting at `dist/` and sets three cache rules:

| Source | Cache-Control | Reason |
| --- | --- | --- |
| `**` | `no-cache` | Every HTML page and the stable `/app.js` entry revalidate, so a reload picks up current code. |
| `/assets/**` | `public, max-age=31536000, immutable` | Hashed filenames change whenever content changes, so a year of caching is safe. |
| `/data/**` | `public, max-age=300, s-maxage=300` | Pipeline JSON may be up to five minutes stale at the edge. |

The SPA rewrite uses a negative glob: `"!/assets/**"` maps everything *except*
asset requests to `/index.html`. That exclusion matters. A browser tab opened
before a deploy holds the old `index.html`, which references hashed chunks the
new deploy no longer contains. With the exclusion, that request misses and
returns a plain 404 instead of falling back to HTML; without it, the browser
would receive HTML where it expected JavaScript and report a confusing module
error. Because HTML is `no-cache`, a reload of the tab fetches a fresh
`index.html` pointing at the current chunks and recovers.

### Content Security Policy

`firebase.json` sends the full policy as the enforced
`Content-Security-Policy` header. The browser blocks resources that do not
match it. Inline executable scripts must be allowed by a SHA-256 hash in the
effective script directive, selected in this order: `script-src-elem`,
`script-src`, then `default-src`. The theme initialiser, consent-pending
script, and application bootstrap ship on every page. The bootstrap is a
hash-authorised classic inline script after `#root`; it inserts the module
entry at the fixed `/app.js` URL. `strict-dynamic` carries that trust to the
app and its lazy imports in modern browsers. The stable entry is outside
`/assets/`, so it inherits `no-cache`; its hashed dependency chunks remain
immutable. When any inline script changes, stage 7 checks the hashes, fixed
URL, and every prerendered page. The node test
`scripts/__tests__/content-security-policy.test.js` checks the source hashes
and cache rules without a build.
`script-src` also includes `'unsafe-inline'` as Lighthouse's older-browser
compatibility fallback; browsers that support hash sources ignore it. The
production-browser regression checks that injected inline code and a
parser-inserted same-origin script remain blocked while the trusted bootstrap
and lazy route code execute.

Real AdSense ads and Funding Choices/consent acceptance still require browser
validation. The live and preview AdSense loader failed DNS resolution during
the latest audit, so that run did not validate real ads, creatives, descendant
requests or Funding Choices.

For an emergency rollback, restore the full policy as
`Content-Security-Policy-Report-Only` and keep a separate enforced
`Content-Security-Policy` header with `frame-ancestors 'none'`. Keep the build
verifier and header-specific tests aligned with that arrangement: they
currently read the enforced header and require the full policy there, so a
rollback also requires updating those checks. Renaming the full-policy header
alone removes the enforced frame-ancestors protection and leaves the verifier
inconsistent.

## Which workflow does what

Four workflows in `.github/workflows/` handle deployment, checks and pairings
updates:

- `preview.yml`, named `Preview`, runs the `preview` job for pull requests from
  the same repository. It runs `yarn check:generated`, `yarn build`, the root
  test suites and the analysis typecheck and test suite. Same-repository
  Dependabot pull requests run the checks but skip the deploy step. Other
  same-repository pull requests receive a preview URL.
- `deploy.yml`, named `Deploy`, runs the `deploy` job on pushes to `main`. It
  runs the build and test gates, verifies premium data, and deploys to
  `channelId: live`.
- `ci.yml`, named `CI`, runs the checks on pushes to and pull requests against
  `main`. See [Running the frontend checks](running-frontend-checks.md#what-ci-runs)
  for the job breakdown.
- `sync-pairings.yml`, named `Sync pairings`, runs the `sync` job every Monday
  at 10:00 UTC and on manual dispatch. It runs `yarn sync-pairings`, typechecks
  and tests `analysis/`, then opens or updates a pull request when
  `analysis/src/data/limitless-decks.json` changes.

Running `firebase init hosting:github` again recreates the generated Hosting
workflows; its merge workflow adds a second live deployment beside `deploy.yml`.

The Deploy workflow uses the `deploy-live` concurrency group, `queue: max` and
`cancel-in-progress: false`. It keeps the active run and allows up to 100
pending live runs. After checkout, it checks whether the commit is still the
tip of `main`. A stale commit skips setup, dependency installation, builds
and tests. A second check runs before deployment, so a run that becomes stale
during validation skips the deploy action. The newest `main` commit stays
eligible for deployment when its gates pass.
When 100 runs are already pending, GitHub cancels any additional run, so the
newest commit may not deploy. Rerun the workflow for the newest commit or push
again to start a new run.
If the newest commit fails its checks, nothing deploys and live stays on the
last deployed commit.
Every push to main must trigger this workflow. Do not use `[skip ci]` or push
with `GITHUB_TOKEN`.

Both deploy workflows inject the Firebase web configuration as
`VITE_FIREBASE_*` environment variables from repository secrets.

Each job uses `.github/actions/setup`, which reads Node from `.nvmrc` and keys
the Yarn cache on the lockfile for the selected workspace. Node `24.19.0` broke
the deploy action's preview-link posting, and newer runner defaults trip a
premature-close bug in the `node-fetch@v2` dependency inside `firebase-tools`.
Do not change the pin without testing a full deploy.

## Running the build path locally

```bash
yarn install
yarn build
```

Then inspect `dist/`: `index.html` should contain rendered markup, not the
Vite template's empty root element, and `dist/deck/` should hold one directory
per ranked deck. To serve it the way Hosting will, any static server pointed
at `dist/` works; remember that real asset requests carry the immutable cache
header, so force-reload when iterating.

The post-build scripts accept a `BUILD_DIR` environment variable if you want
them to act on a different output directory than `dist/`. They load the root
`.env` before running. Set `PUPPETEER_EXECUTABLE_PATH` there when Puppeteer
should use a system Chrome. Lighthouse does not read that variable; export
`CHROME_PATH` separately when running Lighthouse.

The scripts have their own unit tests, separate from the Vitest suites:

```bash
yarn test:scripts
```

This runs every file matching `scripts/__tests__/*.test.js` through Node's
built-in test runner. Run it after changing anything in `scripts/`.

## Related

- [Frontend architecture](../reference/frontend-architecture.md) explains what
  the prerendered HTML boots into.
- [Pipeline output contract](../reference/pipeline-output-contract.md)
  documents the files served under `/data/` with the five-minute cache rule.
