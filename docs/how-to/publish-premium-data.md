# How-to guide: Publishing premium window data

The 30-day and All Time artefacts are the paid part of the site. They are not committed to the repository and they are not served from Hosting. The refresh writes them to `analysis/out/premium/`, you upload them to Firestore with one command, and the app reads them back only for signed-in users who hold an entitlement. Access does not depend on a payment provider: an entitlement is a Firestore document written by an administrator, and an existing Stripe subscription keeps working alongside it. This guide covers the order of work, the one-off set-up, granting access, and rollback.

## What lives where

| Data | Location | Who can read it |
| --- | --- | --- |
| 10-day and 20-day artefacts, `card-scores.json`, `historical-trends.json` | `public/data/`, committed | Everyone |
| `best-decks-{30d,all}`, `matchup-data-{30d,all}`, `meta-share-{30d,all}` | `analysis/out/premium/`, gitignored, then Firestore | Signed-in users with a valid entitlement, or the Stripe `stripeRole` claim |
| `data-version.json` | `public/data/`, committed | Everyone |
| `entitlements/{uid}` | Firestore, written with the Admin SDK | Only the signed-in user it belongs to |

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

## Entitlements

An entitlement is the document `entitlements/{uid}`, keyed by the Firebase Authentication uid of the user:

| Field | Type | Meaning |
| --- | --- | --- |
| `premium` | boolean | `true` grants access, `false` withdraws it |
| `source` | string | Free-form label for where the grant came from, such as `manual` |
| `expiresAt` | timestamp, optional | Access ends at this instant; absent means no expiry |
| `updatedAt` | timestamp | When the document was last written |

Only the Admin SDK writes these documents. The security rules deny every client write, and a signed-in user may read only their own document. The app reads that one document through `useIsPremium()` and treats the user as premium when it grants access, or when the existing Stripe subscription check does. An error from one source never hides a grant from the other.

Grant and revoke access from `analysis` with `yarn grant:premium`. It uses Application Default Credentials and the project in `.firebaserc`.

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

A grant replaces the whole document, so running it again for the same uid changes the expiry or source instead of adding to it. Run it with `--dry-run` first when you are unsure of the uid.

## First-time set-up

Do these once, in this order, before the first merge that carries this change.

1. Merge this block into the existing Firestore security rules in the console. Keep every rule already there, including the ones the Stripe extension needs for `customers` and `products`. The `stripeRole` comparison keeps existing subscribers working while they are still on Stripe; remove it once nobody relies on the claim.

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
   match /premiumData/{version} {
     allow read: if isPremium();
     allow write: if false;
     match /artefacts/{name} {
       allow read: if isPremium();
       allow write: if false;
     }
   }
   ```

   The Admin SDK ignores these rules, so the grant and publish scripts still write. The repository has no `firestore.rules`. Do not add one and deploy it until the console rules are copied in, or the deploy replaces them. Each premium read evaluates the entitlement lookup, which Firestore bills as one extra document read.
2. Grant yourself access with `yarn grant:premium --uid <your uid>`, then check the 30-day window loads when you are signed in.
3. Bootstrap the first version. Copy the six premium files from the last commit that still carried them (for example with `git show origin/main:public/data/best-decks-30d.json`) into `analysis/out/premium/`, then run the publish and verify steps above.
4. Create the GitHub secret `FIREBASE_PREMIUM_VERIFIER`: the JSON key of a service account whose only role is Cloud Datastore Viewer. Only the merge workflow uses it, so pull request checks need no new secret.

## Existing Stripe subscribers (optional)

Skip this section when nobody is still subscribed through Stripe. It exists only so subscribers keep their windows while the account is wound down.

1. In the Stripe product used for Premium, set the metadata `firebaseRole` to `premium`. The Firebase Stripe extension then writes the custom claim `stripeRole: "premium"` on the user token.
2. The extension sets the claim only on subscription events, so existing subscribers need a backfill: re-save their subscription in Stripe, or trigger a subscription event for each customer.
3. Decide which subscription states keep the claim. The app counts `active`, `trialing` and `past_due` as premium for the interface (`use-is-premium.ts`). If the extension drops the claim on `past_due`, those users still see the premium interface but lose the windows. Either accept that or align the two.

To stop depending on Stripe, run `yarn grant:premium` for each remaining subscriber with `--until` set to the end of their paid period and `--source stripe`, then remove the `stripeRole` comparison from `isPremium()`.

## Wiring a future payment provider

Nothing in the app or the rules is tied to a provider. Any provider can grant access by writing `entitlements/{uid}` from trusted server code:

1. The provider sends a webhook to a small handler that you run, for example a Cloud Function, and the handler verifies the provider's signature before it trusts the payload.
2. The handler works out which Firebase uid the payment belongs to. Pass the uid to the provider when the checkout starts, as client reference metadata, so the webhook can read it back.
3. On a successful payment or renewal it writes `{ premium: true, source: "<provider label>", expiresAt: <end of the paid period>, updatedAt: <now> }` with the Admin SDK.
4. On a cancellation that takes effect, a refund or a chargeback it writes `{ premium: false, source: "<provider label>", updatedAt: <now> }`.
5. Writing an `expiresAt` for every paid period means access lapses on its own if a webhook is ever missed.

The handler never needs to touch the rules, the client code or the premium data. `analysis/src/utils/premium-grant.ts` shows the exact document shape, and `yarn grant:premium --dry-run` prints it.

## Rollback

Each upload is a new version, and the newest five stay in Firestore. To go back, restore the earlier commit version of `data-version.json`. If that version is still in Firestore, `yarn verify:premium` passes and the site serves it once deployed. If it has been pruned, restore its files into `analysis/out/premium/` and publish again; the version is a hash of the contents, so the same files give the same version.

## Troubleshooting

- `the premium files hash to X but data-version.json says Y`: the premium files and the committed version are out of step. Rerun the refresh instead of editing either file.
- `... is N bytes, the limit is 900000`: an artefact is approaching the Firestore document cap of 1 MiB. The largest file today is `matchup-data-*` at about 268 KB. Trim the artefact or split it before raising the limit.
- A premium user sees the 20-day window after choosing 30d: the read was denied twice, even after a forced token refresh. Check that `entitlements/{uid}` exists for that uid with `premium: true` and an `expiresAt` that has not passed, or that the Stripe claim is present, and check the console rules.
- `yarn grant:premium` fails with a message about default credentials: run `gcloud auth application-default login` and try again.
- A user who was granted access still sees the free interface: the entitlement is cached in the browser for up to an hour. Ask them to reload the page.
- The build fails with `Premium window data shipped in the build output`: a premium file has been put back under `public/data/`. Remove it.

## Related

[Data and analysis pipeline reference](../reference/analysis-pipeline.md) covers how the artefacts are computed. [Advertising, premium and consent](../explanation/ads-premium-and-consent.md) explains what Premium unlocks.
