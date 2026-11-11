# How-to guide: Publishing premium window data

The 30-day and All Time artefacts, and the full matchup and movement depth of the 10-day and 20-day artefacts, are the paid part of the site. They are not committed to the repository and they are not served from Hosting. The refresh writes them to `analysis/out/premium/`, the refresh job uploads them to Firestore at step 10, and the app reads them back only for signed-in users who hold an entitlement. Premium time is granted by tips through [Ko-fi](https://ko-fi.com/dalin) or by hand with the Admin SDK. This guide covers the order of work, the one-off set-up, granting access, and rollback. The manual commands below remain for recovery when the job has already run.

## What lives where

| Data | Location | Who can read it |
| --- | --- | --- |
| `best-decks-{10d,20d}`, `card-scores.json`, `historical-trends.json` | `public/data/`, committed | Everyone |
| `matchup-data-{10d,20d}` and `meta-share-{10d,20d}`, plus the un-suffixed `matchup-data.json` and `meta-share.json`, trimmed to the free tier | `public/data/`, committed | Everyone |
| The full `matchup-data-{10d,20d}` and `meta-share-{10d,20d}` | `analysis/out/premium/`, gitignored, then Firestore | Signed-in users with an active entitlement in the current frontend; the retained legacy `stripeRole` console rule also permits Firestore reads |
| `best-decks-{30d,all}`, `matchup-data-{30d,all}`, `meta-share-{30d,all}` | `analysis/out/premium/`, gitignored, then Firestore | The same |
| `data-version.json` | `public/data/`, committed | Everyone |
| `entitlements/{uid}` | Firestore, written with the Admin SDK | Only the signed-in user it belongs to |
| `premiumCodes/{code}` | Firestore, created by the signed-in user | Only the signed-in user it belongs to |

`data-version.json` holds `{ "premium": "<16 hex characters>" }`, the first 16 characters of a SHA-256 over the length-prefixed names and contents of the ten premium artefacts. The publisher recomputes that value before uploading and refuses a mismatch. The refresh rewrites it whenever the premium files change. The app reads it to find the matching documents, and CI uses it to confirm that the upload happened

Firestore holds one document per version at `premiumData/{version}`, with `createdAt` and the SHA-256 of every artefact, and one document per artefact at `premiumData/{version}/artefacts/{name}` with the JSON text as `payload` and its `sha256`. The client checks the hash before it parses anything

## What the free tier gets

The free tier is the top 10 decks of the 10-day and 20-day windows. The ten are the first ten of that window's `best-decks` ranked by Power Score, the same ranking the statistics matrix has always used. The code is `freeDeckNames` in `src/app/free-tier.ts`, and the pipeline imports it so the site and the data cannot disagree

For those windows the public files are trimmed at refresh time:

- `matchup-data-{10d,20d}.json` and `matchup-data.json` keep every row for the ten free decks and only the `Total` row for every other deck, so the overall win rate stays public for every deck.
- `meta-share-{10d,20d}.json` and `meta-share.json` keep the full entry for the ten free decks and `{ name, share, windowGames }` for every other deck. The movement fields `sharePrev`, `delta`, `firstSeen` and `isNew` are therefore public only for the free decks.
- `best-decks-{10d,20d}.json` stays whole and public.

The untrimmed versions of those four files become the premium artefacts `matchup-data-10d`, `matchup-data-20d`, `meta-share-10d` and `meta-share-20d`. The 30-day and All Time windows have no public files at all. A premium viewer reads the full artefact for every window; anyone else reads the trimmed public file for 10d and 20d. If a premium read is denied on 10d or 20d, the app falls back to the trimmed public file and stays on that window

`scripts/__tests__/free-tier-data.test.js` fails when a committed public file carries a matchup row other than `Total`, or a movement field, for a deck outside the free ten

## The order of work for every refresh

The scheduled refresh job (`cronjob/local-analysis-data-refresh-pr.md`) runs these steps for you: starting the refresh, validating it, then `yarn publish:premium --dry-run`, `yarn publish:premium` and `yarn verify:premium`, and it reports the published version in the pull request body. The manual order below is the recovery path: if the job is interrupted, run the steps yourself

1. Run the refresh in `analysis` (`yarn start`). It writes the JSON files atomically, then commits OG images separately. The image commit can fail after JSON publication. In that case the rendered staging directory is kept and the refusal names its exact path; finish the swap before starting another run.
2. Run `yarn validate:refresh`. It reads the 10d and 20d rankings from `public/data/` and the 30d and all rankings from `analysis/out/premium/`.
3. Authenticate once per machine with `gcloud auth application-default login`. The upload uses Application Default Credentials. Never put a key file in the repository and never put credentials in `.env`.
4. Run `yarn publish:premium --dry-run` in `analysis` to see what would be written. The dry run does not contact Firebase.
5. Run `yarn publish:premium`. It checks that the premium files match the committed `data-version.json`, writes artefacts first and the complete version manifest last, then prunes unreferenced versions outside the newest five. It protects the version on canonical `PocketDecks` `main`, the deployed version at `pocketdecks.top`, versions from open pull requests targeting `main` when their version file is readable, and versions on every local or remote `automated/*` ref, including nested branch names. A missing pull request version file is reported and contributes no protected version. If Git, Hosting or GitHub cannot supply any retention source, the upload can finish and cloud pruning is skipped, and a warning names the source that could not be read.

   Each publisher takes Firestore document `premiumPublishLocks/global` before discovery, before listing existing versions, and holds it until upload, pruning and local snapshot cleanup finish. A crashed publisher can leave the lock in place. Check its host, process ID and acquisition time; confirm no publisher process is still running before deleting the document in the Firebase console. The lock has no expiry because a paused process could resume after a lease was reused

   The deployed `data-version.json` is served with `no-store`, so the deployed version is not read through the 300 s `/data/**` CDN cache. Discovery requests are bounded by a timeout, and a changed pull request list during pagination stops pruning from an incomplete protection set.

   When all retention sources are readable, local version directories keep canonical main, the deployed version, pending pull request versions, automated-branch versions and the newly published version. Unknown entries and loose files remain; only versioned directories are read as baselines. A fresh checkout has no snapshot for the version canonical `main` currently serves, because snapshots are written locally by `publish:premium` and are not committed. That is a normal first publish: `yarn start` logs the missing snapshot and skips only the previous-archetype-count ratio for the 30d and all windows; the configured archetype floors still apply. `publish:premium` then writes the snapshot for the new version. A missing `data-version.json` on canonical `main` is also a first publish. A malformed or unreadable committed file is a refusal, and the warning names the source and reason. A refusal also happens when the canonical `main` remote cannot be resolved at all, which means the checkout has no remote pointing at `PocketDecks/pokemon-tcg-pocket-tier-list`.
6. Run `yarn verify:premium`. It exits non-zero unless the version document and all ten artefacts exist and every stored hash matches its payload.
7. Commit and merge. The merge workflow runs `yarn verify:premium` again before it deploys, so a version that was never uploaded cannot go live.

Upload before you merge. A deployed site that points at a version Firestore does not hold shows the premium windows as unavailable

## Entitlements

An entitlement is the document `entitlements/{uid}`, keyed by the Firebase Authentication uid of the user:

| Field | Type | Meaning |
| --- | --- | --- |
| `premium` | boolean | `true` grants access, `false` withdraws it |
| `source` | string | Free-form label for where the grant came from, such as `manual` |
| `expiresAt` | timestamp, optional | Access ends at this instant; absent means no expiry |
| `updatedAt` | timestamp | When the document was last written |

Only the Admin SDK writes these documents. The security rules deny every client write, and a signed-in user may read only their own document. The app reads that document through `useIsPremium()` and grants access only when it is active. Ko-fi tips grant months through the Worker; an owner can grant or revoke access with `yarn grant:premium`.

Grant and revoke access from `analysis` with `yarn grant:premium`. It uses Application Default Credentials and the project in `.firebaserc`

```
yarn grant:premium --uid <uid> --dry-run
yarn grant:premium --uid <uid>
yarn grant:premium --uid <uid> --until 2027-03-31 --source gift
yarn grant:premium --uid <uid> --revoke
```

- `--uid` is required and is the uid shown for the user in the Firebase console under Authentication.
- `--until YYYY-MM-DD` sets the last day of access, inclusive, in UTC. It must be in the future. Leave it out for access with no expiry.
- `--source` labels the grant and defaults to `manual`.
- `--revoke` writes `premium: false` and drops any expiry. It cannot be combined with `--until`.
- `--dry-run` prints the document that would be written without contacting Firebase.

A grant replaces the whole document, so running it again for the same uid updates the expiry or source. Run it with `--dry-run` first when you are unsure of the uid

## First-time set-up

Do these once, in this order, before the first merge that carries this change

1. Before release, the owner must confirm the existing Firestore rules in the Firebase console and merge the blocks below into them. Keep unrelated rules, including the existing `stripeRole` branch and any rules for `customers` and `products`, unchanged. The app grants Premium from entitlements only. The legacy `stripeRole` branch is retained in the console as-is and a claim alone does not enable the current Premium interface. No live rules were changed or verified for this task. The repository does not contain the live rules; do not deploy a rules file from this repository.

   ```
   function entitlementPath() {
     return /databases/$(database)/documents/entitlements/$(request.auth.uid);
   }
   function hasEntitlement() {
     return request.auth != null
       && exists(entitlementPath())
       && get(entitlementPath()).data.premium == true
       && (!("expiresAt" in get(entitlementPath()).data)
           || get(entitlementPath()).data.expiresAt > request.time);
   }
   function isPremium() {
     return request.auth != null
       && (hasEntitlement() || request.auth.token.get("stripeRole", null) == "premium");
   }
   match /entitlements/{uid} {
     allow read: if request.auth != null && request.auth.uid == uid;
     allow write: if false;
   }
   match /premiumCodes/{code} {
     allow read: if request.auth != null
       && resource.data.uid == request.auth.uid;
     allow create: if request.auth != null
       && code.matches('PD-[A-Z0-9]{6}')
       && request.resource.data.keys().hasAll(['uid'])
       && request.resource.data.keys().hasOnly(['uid'])
       && request.resource.data.uid == request.auth.uid;
     allow update, delete: if false;
   }
   match /premiumData/{version} {
     allow read: if isPremium();
     allow write: if false;
     match /artefacts/{name} {
       allow read: if isPremium();
       allow write: if false;
     }
   }
   ```

   The Admin SDK ignores these rules, so the grant and publish scripts still write. The `premiumCodes` rule lets a signed-in account query and read its own code, and permits the client SDK's `setDoc` only when it creates a correctly shaped code for that same uid. Existing codes cannot be changed or deleted. If a randomly generated code already exists, the attempted overwrite is denied and the client tries another code. These rules must be confirmed in the console before release; this repository has no `firestore.rules` and no live console rules were verified for this task. Each premium data read evaluates the entitlement lookup, which Firestore bills as one extra document read.
2. Grant yourself access with `yarn grant:premium --uid <your uid>`, then check the 30-day window loads when you are signed in.
3. Bootstrap the first version. `analysis/out/premium/` must hold all ten files before the first publish: `best-decks-30d`, `best-decks-all`, `matchup-data-10d`, `matchup-data-20d`, `matchup-data-30d`, `matchup-data-all`, `meta-share-10d`, `meta-share-20d`, `meta-share-30d` and `meta-share-all`. The 30d and all files come from the last commit that still carried them (for example with `git show origin/main:public/data/best-decks-30d.json`). The full 10d and 20d matchup and meta-share files come from git history before the free-tier trimming landed: find the commit that trimmed them with `git log --oneline -- public/data/matchup-data-20d.json` and read each file from its parent, for example `git show <parent>:public/data/matchup-data-20d.json`. Copy them into `analysis/out/premium/` unchanged, then run the publish and verify steps above. `yarn publish:premium` refuses to start when the ten files do not hash to the committed `data-version.json`, so a wrong copy is caught before anything is uploaded. Any later refresh regenerates all ten files.
4. Create the GitHub secret `FIREBASE_PREMIUM_VERIFIER`: the JSON key of a service account whose only role is Cloud Datastore Viewer. Only the merge workflow uses it, so pull request checks need no new secret.

## Ko-fi tips and manual grants

The Ko-fi Worker matches a tip to the signed-in account using the code shown in the Premium popup or the account's verified Google email. Each whole GBP 1 grants one calendar month; later tips extend the existing expiry. The [Ko-fi receiving guide](receive-ko-fi-payments.md) covers Worker setup and how to resolve payments that need manual review. For a gift or another manual grant, use `yarn grant:premium` as described above. Both methods write the same `entitlements/{uid}` document; the browser does not grant access itself.

## Rollback

Each upload is a new version. The newest five stay in Firestore, along with versions referenced by canonical `PocketDecks` `main`, the deployed site and open pull requests targeting `main`. To go back, restore the earlier commit version of `data-version.json`. If that version is still in Firestore, `yarn verify:premium` passes and the site serves it once deployed. If it has been pruned, restore its files into `analysis/out/premium/` and publish again; the version is a hash of the contents, so the same files give the same version

## Troubleshooting

- `the premium files hash to X but data-version.json says Y`: the premium files and the committed version differ. Rerun the refresh; keep both files unchanged.
- `... is N bytes, the limit is 900000`: an artefact is approaching the Firestore document cap of 1 MiB. The largest files today are the four `matchup-data-*` artefacts at about 268 KB each. Trim the artefact or split it before raising the limit.
- A premium user sees the trimmed matchups and movement on the 10-day or 20-day window: the read of the full artefact was denied twice, even after a forced token refresh, and the app fell back to the public file. The cause below applies here too.
- A premium user sees the 20-day window after choosing 30d: the read was denied twice, even after a forced token refresh. Check that `entitlements/{uid}` exists for that uid with `premium: true` and an `expiresAt` that has not passed, and check the console rules.
- `yarn grant:premium` fails with a message about default credentials: run `gcloud auth application-default login` and try again.
- A user who was granted access still sees the free interface: the entitlement is cached in the browser for up to an hour. Ask them to reload the page.
- The build fails with `Premium window data shipped in the build output`: a 30-day or All Time file has been put back under `public/data/`. Remove it.
- `scripts/__tests__/free-tier-data.test.js` fails: a public 10d or 20d file carries depth for a deck outside the free ten. Rerun the refresh; keep the generated file under pipeline control.

## Related

[Data and analysis pipeline reference](../reference/analysis-pipeline.md) covers how the artefacts are computed. [Advertising, premium and consent](../explanation/ads-premium-and-consent.md) explains what Premium unlocks
