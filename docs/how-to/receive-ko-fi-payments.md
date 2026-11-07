# How-to guide: Receiving Ko-fi payments

A small Cloudflare Worker in `workers/kofi/` receives Ko-fi's payment webhooks and writes Premium access to Firestore. Every whole GBP 1 buys one calendar month of Premium, and payments stack. This guide covers what the Worker does and the owner steps to switch it on after merge.

## What the Worker does

Ko-fi sends a `POST` with a form body holding one field, `data`, which contains JSON. The Worker only answers `POST /kofi`. Any other method or path returns 404.

For each delivery it runs these steps in order:

1. Parses the body. A body it cannot parse, or one missing the token, amount, currency or an id, returns 400.
2. Compares `verification_token` with the `KOFI_VERIFICATION_TOKEN` secret in constant time. A mismatch returns 401 and nothing is written.
3. Works out the months. Only GBP counts, and the months are the whole pounds in the amount. Any other currency, or an amount under GBP 1, is recorded as `needs-review` and grants nothing.
4. Finds the user. A code like `PD-ABC123` in the message is looked up in `premiumCodes/{code}`, which holds `{ uid }`. The site does not issue codes yet, so for now matching falls through to the Ko-fi email, which the Worker looks up through the Identity Toolkit admin endpoint. If neither finds a user the payment is recorded as `unmatched`.
5. Grants the months. Inside a Firestore transaction it reads `entitlements/{uid}`. A premium entitlement with no `expiresAt` is a lifetime grant, so the Worker leaves it alone and records `already-lifetime`. Otherwise the new `expiresAt` starts from the later of now and the current expiry, then adds the months as UTC calendar months. A start on 31 January plus one month ends on the last day of February.
6. Commits once. The same Firestore commit creates `kofiPayments/{id}`, writes the entitlement and adds the amount to `tipTotals/{YYYY-MM}`.

The entitlement document has the shape the site reads: `premium`, `source` (set to `kofi`), `expiresAt` and `updatedAt`

The payment document is created with an "exists: false" precondition, keyed on `kofi_transaction_id` (or `message_id` when that is missing). A repeat delivery fails the precondition, so the Worker returns 200 and changes nothing. Ko-fi retries any response that is not 200, so an upstream failure returns 500 on purpose.

The payment document stores the buyer's email and name only when the status is not `granted`, because you need them to match an `unmatched` or `needs-review` payment by hand. Responses never include the token, an email or service-account data, and the logs carry only the payment id and status.

These collections need no change to `firestore.rules`. Clients are denied by default, and the Worker uses admin credentials.

## Owner steps after merge

1. In Google Cloud, open project `pokemon-tcg-pocket-tier-list` and create a service account named `kofi-receiver`. Give it the roles Cloud Datastore User and Firebase Authentication Viewer, then create and download one JSON key.
2. In the new Cloudflare account, run `yarn --cwd workers/kofi wrangler login`, then `yarn --cwd workers/kofi deploy`. The first deploy creates the Worker `pocketdecks-kofi`.
3. In the Cloudflare dashboard, go to Workers & Pages, select `pocketdecks-kofi`, then Settings, then Variables and Secrets, and choose Add. Set the type to Secret and add two:
   - `KOFI_VERIFICATION_TOKEN`, copied from ko-fi.com/manage/webhooks
   - `FIREBASE_SERVICE_ACCOUNT`, holding the whole contents of the JSON key
4. Delete the downloaded key file once the secret is saved.
5. Paste `https://pocketdecks-kofi.<account subdomain>.workers.dev/kofi` into the webhook URL field on ko-fi.com/manage/webhooks, replacing `<account subdomain>` with the subdomain shown under Workers & Pages. Then use Ko-fi's test button.
6. Later, when the DNS zone moves to the new Cloudflare account, the URL can change to `api.pocketdecks.top/kofi`.

## Checking a delivery

After a test delivery, open `kofiPayments` in the Firestore console. A test payment with no matching user shows `unmatched` and keeps the email, which proves the token, the service account and the commit all work. A 401 in the Ko-fi webhook log points at the verification token, and a 500 points at the service account secret or its roles.

To grant Premium for an `unmatched` payment, find the user's uid in Firebase Authentication and write an `entitlements/{uid}` document by hand with `premium: true`, `source: "kofi"`, an `expiresAt` timestamp and `updatedAt`. A script for this is a planned follow-up.
