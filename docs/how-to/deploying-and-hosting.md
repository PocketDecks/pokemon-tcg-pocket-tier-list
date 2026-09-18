# How-to guide: Deploying and hosting

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
4. Bundle. `vite build` transforms the app into `dist/`, emitting hashed
   chunks under `dist/assets/`.
5. Route prerendering. `node scripts/prerender-routes.js` serves `dist/` on
   `127.0.0.1:4173`, loads each static route in headless Chromium through
   Puppeteer, stamps per-route titles, descriptions and canonicals using
   `stampHead` in `scripts/meta-stamp.js`, and writes each result as
   `<route>/index.html`. It aborts third-party requests (ads, Firebase,
   fonts) but allows the external card database, because rendering gates on
   card data loading. Any page error fails the stage.
6. Deck prerendering. `node scripts/prerender-decks.js` writes one
   `dist/deck/<slug>/index.html` per deck in `best-decks.json`, each stamped
   with Open Graph and Twitter meta plus BreadcrumbList JSON-LD.
7. Dist verification. `node scripts/verify-dist-html.js` scans every built
   HTML file for `127.0.0.1` or `localhost` references and exits non-zero if
   any survive, since a leaked loopback URL would break the deployed page.

Stages 5 to 7 form the `postbuild` hook, so they never run without stages 1 to
4 ahead of them. If a build stops after the Vite stage you have a stale `dist/`
with template HTML but no prerendered pages; rerun the whole command.

The first build downloads a Chromium build for Puppeteer. Later runs reuse it.

## How hosting serves the output

`firebase.json` points Hosting at `dist/` and sets three cache rules:

| Source | Cache-Control | Reason |
| --- | --- | --- |
| `**` | `no-cache` | Every HTML page revalidates, so a reload picks up new chunk references immediately. |
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

## Which workflow does what

Three workflows in `.github/workflows/` cover deployment and checks:

- `firebase-hosting-pull-request.yml`, named "Deploy to Firebase Hosting on
  PR", triggers on every pull request. It installs with `--frozen-lockfile`,
  runs `yarn build`, the frontend test suite, the script tests and the analysis
  typecheck and test suite, then calls `FirebaseExtended/action-hosting-deploy@v0`
  without a `channelId`. That creates an ephemeral preview channel and posts
  its URL on the pull request. The `if` condition skips forks, so first-time
  contributors do not get a failed check.
- `firebase-hosting-merge.yml`, named "Deploy to Firebase Hosting on merge",
  triggers on pushes to `main`, runs the same test gates, and deploys to
  `channelId: live`.
- `frontend-tests.yml`, named "Frontend Tests", runs typecheck, lint,
  `yarn test:ci` and `yarn test:scripts` on pushes to and pull requests
  against `main`. It reports independently; the deploy workflows run those
  gates before invoking Firebase.

Both deploy workflows inject the Firebase web configuration as
`REACT_APP_FIREBASE_*` environment variables from repository secrets.

All three workflows pin Node to `24.18.1` through `actions/setup-node@v7`,
and the pin is deliberate. Node `24.19.0` broke the deploy action's
preview-link posting, and newer runner defaults trip a premature-close bug in
the `node-fetch@v2` dependency inside `firebase-tools`. Do not bump the pin
without testing a full deploy.

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
them to act on a different output directory than `dist/`.

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
