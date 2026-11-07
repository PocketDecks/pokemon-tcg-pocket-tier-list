# How-to guide: Publishing premium window data

The 30-day and All Time artefacts are the paid part of the site. They are not committed to the repository and they are not served from Hosting. The refresh writes them to `analysis/out/premium/`, you upload them to Firestore with one command, and the app reads them back only for signed-in users whose token carries the premium role. This guide covers the order of work, the one-off set-up, and rollback.

## What lives where

| Data | Location | Who can read it |
| --- | --- | --- |
| 10-day and 20-day artefacts, `card-scores.json`, `historical-trends.json` | `public/data/`, committed | Everyone |
| `best-decks-{30d,all}`, `matchup-data-{30d,all}`, `meta-share-{30d,all}` | `analysis/out/premium/`, gitignored, then Firestore | Signed-in users with `stripeRole == "premium"` |
| `data-version.json` | `public/data/`, committed | Everyone |

`data-version.json` holds `{ "premium": "<16 hex characters>" }`, the first 16 characters of a SHA-256 over the premium artefact names and contents. The refresh rewrites it whenever the premium files change. The app reads it to find the matching documents, and CI uses it to confirm that the upload happened.

Firestore holds one document per version at `premiumData/{version}`, with `createdAt` and the SHA-256 of every artefact, and one document per artefact at `premiumData/{version}/artefacts/{name}` with the JSON text as `payload` and its `sha256`. The client checks the hash before it parses anything.

## The order of work for every refresh

1. Run the refresh in `analysis` (`yarn start`). It writes the public files, the premium files and `data-version.json` together or not at all.
2. Run `yarn validate:refresh`. It reads 10d and 20d from `public/data/` and 30d and all from `analysis/out/premium/`.
3. Authenticate once per machine with `gcloud auth application-default login`. The upload uses Application Default Credentials. Never put a key file in the repository and never put credentials in `.env`.
4. Run `yarn publish:premium --dry-run` in `analysis` to see what would be written. The dry run does not contact Firebase.
5. Run `yarn publish:premium`. It refuses to start when the premium files do not hash to the committed `data-version.json`. It writes the artefact documents first and the version document last, so a half-finished upload is never visible to the app, then deletes versions beyond the newest five.
6. Run `yarn verify:premium`. It exits non-zero unless the version document and all six artefacts exist and every stored hash matches its payload.
7. Commit and merge. The merge workflow runs `yarn verify:premium` again before it deploys, so a version that was never uploaded cannot go live.

Upload before you merge. A deployed site that points at a version Firestore does not hold shows the premium windows as unavailable.

## First-time set-up

Do these once, in this order, before the first merge that carries this change.

1. In the Stripe product used for Premium, set the metadata `firebaseRole` to `premium`. The Firebase Stripe extension then writes the custom claim `stripeRole: "premium"` on the user token. The extension sets the claim only on subscription events, so existing subscribers need a backfill: re-save their subscription in Stripe, or trigger a subscription event for each customer.
2. Decide which subscription states keep the claim. The app counts `active`, `trialing` and `past_due` as premium for the interface (`use-is-premium.ts`). If the extension drops the claim on `past_due`, those users still see the premium interface but lose the windows. Either accept that or align the two.
3. Merge this block into the existing Firestore security rules in the console. Keep the rules the Stripe extension already needs for `customers` and `products`.

   ```
   function isPremium() {
     return request.auth != null && request.auth.token.stripeRole == "premium";
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

   The repository has no `firestore.rules`. Do not add one and deploy it until the console rules are copied in, or the deploy replaces them.
4. Bootstrap the first version. Copy the six premium files from the last commit that still carried them (for example with `git show origin/main:public/data/best-decks-30d.json`) into `analysis/out/premium/`, then run the publish and verify steps above.
5. Create the GitHub secret `FIREBASE_PREMIUM_VERIFIER`: the JSON key of a service account whose only role is Cloud Datastore Viewer. Only the merge workflow uses it, so pull request checks need no new secret.

## Rollback

Each upload is a new version, and the newest five stay in Firestore. To go back, restore the earlier commit version of `data-version.json`. If that version is still in Firestore, `yarn verify:premium` passes and the site serves it once deployed. If it has been pruned, restore its files into `analysis/out/premium/` and publish again; the version is a hash of the contents, so the same files give the same version.

## Troubleshooting

- `the premium files hash to X but data-version.json says Y`: the premium files and the committed version are out of step. Rerun the refresh instead of editing either file.
- `... is N bytes, the limit is 900000`: an artefact is approaching the Firestore document cap of 1 MiB. The largest file today is `matchup-data-*` at about 268 KB. Trim the artefact or split it before raising the limit.
- A premium user sees the 20-day window after choosing 30d: the read was denied twice, even after a forced token refresh. Check the user claim and the console rules.
- The build fails with `Premium window data shipped in the build output`: a premium file has been put back under `public/data/`. Remove it.

## Related

[Data and analysis pipeline reference](../reference/analysis-pipeline.md) covers how the artefacts are computed. [Advertising, premium and consent](../explanation/ads-premium-and-consent.md) explains what Premium unlocks.
