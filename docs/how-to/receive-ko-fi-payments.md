# How-to guide: Receiving Ko-fi payments

The Cloudflare Worker in `workers/kofi/` takes Ko-fi's payment webhooks and
writes Premium access to Firestore. Each whole GBP 1 in a tip buys one
calendar month, and a second tip adds its months to the end of the first

The Worker deploys on its own, so it can go live before the site reads
Premium from `entitlements`

## What the Worker does

Ko-fi sends a `POST` whose form body has one field, `data`, holding JSON. The
Worker answers `POST /kofi` and returns 404 for any other method or path

For each delivery it works through these steps:

1. It reads the body, stopping with 413 once it passes 16 KiB (16,384
   bytes). It then returns 400 when the body is unreadable or lacks the
   token, the amount, the currency or a usable id. Ids of the form
   `__name__` are unusable, because Firestore reserves them
2. It compares `verification_token` with the `KOFI_VERIFICATION_TOKEN`
   secret in constant time. On a mismatch it returns 401 and writes nothing
3. It counts the months. One-off tips (`Donation`) and monthly tips
   (`Subscription`) in GBP earn one month per whole pound, up to 120
   months. The Worker marks a shop order, a commission, another currency,
   anything under GBP 1 and anything over GBP 120 as `needs-review` and
   grants nothing
4. It looks for the user. A code such as `PD-ABC123` in the message points at
   `premiumCodes/{code}`, which holds `{ uid }`. Codes are upper case, and
   no capital letter or digit may sit directly before or after one. The uid
   must be up to 128 letters and digits, and the Worker asks Identity
   Toolkit for it by `localId`. It accepts exactly one account that is not
   disabled, with or without a verified email, and otherwise moves on to the
   email. The site issues no codes yet, so for now the email does the work.
   The Worker trims it, lower-cases it and asks the Identity Toolkit admin
   endpoint for the matching account. It accepts exactly one account that
   has a verified email and is not disabled. With no match, or a 400 from
   the lookup, it marks the payment `unmatched`. Any other lookup failure
   returns 500
5. It grants the months. Inside a Firestore transaction it reads
   `entitlements/{uid}`. A premium entitlement with no `expiresAt`, or with
   a null one, is a lifetime grant, which the Worker leaves alone and marks
   `already-lifetime`. An `expiresAt` of any other type counts as already
   expired, so the grant restarts from now. An
   active `expiresAt` after 1 January 2100 counts as lifetime too, because
   stacking months onto it would give a year Firestore rejects. Any other
   entitlement gets a new `expiresAt`, counted in UTC calendar months from
   the later of now and an active expiry. One month from 31 January ends on
   the last day of February
6. It commits once. A single Firestore commit creates `kofiPayments/{id}`,
   writes the entitlement only when the payment grants months and, for a
   GBP `Donation` or `Subscription`, adds the amount to
   `tipTotals/{YYYY-MM}`. The month comes from the Ko-fi
   timestamp when that lies within two days of now, and from now otherwise.
   The Worker still records other payments but leaves the totals alone

The entitlement keeps the fields the site reads: `premium`, `source` (always
`kofi`), `expiresAt` and `updatedAt`

The Worker names each payment document after `kofi_transaction_id` and
`message_id` joined by a hyphen, or after whichever one Ko-fi sends when the
other is missing, and creates it only if it does not exist yet. Ko-fi's test
payloads all share one transaction id, so the message id keeps them apart.
When Ko-fi delivers the same payment twice, Firestore rejects the second
create with `ALREADY_EXISTS`, the Worker rolls back any transaction it
opened and returns 200 without changing anything. Every other Firestore
error, including an aborted transaction from two payments racing for one
user, makes the Worker roll back any transaction it opened and answer 500.
When Google rejects the cached access token, the Worker drops it so the
next delivery fetches a fresh one. Ko-fi retries
every response other than 200, so the delivery arrives again and the Worker
handles it afresh

The Worker keeps the tipper's email, name and message only on payments it
did not grant, because you need them to match an `unmatched` or
`needs-review` payment by hand. Responses never carry the token, an email
or the service account. A log line holds the payment id and its status, and
a failure line adds the cause: the operation and HTTP status of a Google
error, or just the error name for anything else. The Worker cuts stored
text to 320 characters for the email, 500 for the message, 200 for the
name, 64 for the Ko-fi timestamp, 32 for the type and 8 for the currency

The Firestore rules live in the Firebase console and need no change. They
deny clients every collection they do not list, and the Worker signs in with
admin credentials

## Switching it on

1. In Google Cloud, open the project `pokemon-tcg-pocket-tier-list` and
   create a service account called `kofi-receiver`. Give it the roles Cloud
   Datastore User and Firebase Authentication Viewer, then create and
   download one JSON key
2. Sign in to the new Cloudflare account and deploy from the repository
   root:
   ```bash
   yarn --cwd workers/kofi install
   yarn --cwd workers/kofi wrangler login
   yarn --cwd workers/kofi deploy
   ```
   The first deploy creates the Worker `pocketdecks-kofi` and prints its
   address
3. In the Cloudflare dashboard, open Workers & Pages, then
   `pocketdecks-kofi`, then Settings, then Variables and Secrets, and choose
   Add. Set the type to Secret and add two:
   - `KOFI_VERIFICATION_TOKEN`, copied from ko-fi.com/manage/webhooks
   - `FIREBASE_SERVICE_ACCOUNT`, holding the whole JSON key
4. Delete the downloaded key file
5. On ko-fi.com/manage/webhooks, set the webhook URL to
   `https://pocketdecks-kofi.<account subdomain>.workers.dev/kofi`, using the
   subdomain shown under Workers & Pages, and send a test
6. Once the DNS zone moves to the new Cloudflare account, the URL can change
   to `api.pocketdecks.top/kofi`. That needs a route in `wrangler.toml` and
   a redeploy. Put the `routes` line near the top of the file, above the
   first `[observability]` table, because TOML would otherwise read it as
   part of the last table:
   ```toml
   routes = [{ pattern = "api.pocketdecks.top/kofi", zone_name = "pocketdecks.top" }]
   ```

## Running it locally

Copy `workers/kofi/.dev.vars.example` to `workers/kofi/.dev.vars`, fill in
both values and run `yarn --cwd workers/kofi dev`. Git ignores `.dev.vars`,
so the key stays out of commits

The file reads one variable per line, so the service account JSON must sit
on a single line, wrapped in single quotes. Pasted across several lines, the
key gets cut short:

```
FIREBASE_SERVICE_ACCOUNT='{"type":"service_account",...}'
```

## Checking a delivery

Open `kofiPayments` in the Firestore console after a test. Ko-fi's test
payloads are in US dollars, so the document shows `needs-review` with the
email kept. That result means the token, the service account and the
commit all work

Each of Ko-fi's test buttons creates its own document, because the message
ids differ. Pressing the same button twice sends a duplicate, so the
Worker returns 200 and changes nothing

In Ko-fi's webhook log, a 401 points at the verification token. For a 500,
read the Worker's failure log line first, because it names the failing
call and its status. Common causes are the `FIREBASE_SERVICE_ACCOUNT`
secret or its roles, an exhausted Firestore quota, a Google outage, and a
payment racing another for the same user, which Ko-fi's retry then settles

The payment document keeps the tipper's message on every payment the Worker
did not grant, so a code or account email written there is still to hand

## Granting a payment by hand

The `grant` script credits an `unmatched` or `needs-review` payment to a
user you pick. It reuses the Worker's own code, so it stacks months, leaves
lifetime access alone and applies the 2100 rule the same way. It runs in
one Firestore transaction: it reads the payment and the entitlement, then
commits both writes together. If the Worker touches the entitlement in the
meantime, Firestore aborts the commit and nothing changes

1. Find the user's uid under Firebase Authentication
2. In Google Cloud, create a JSON key for the `kofi-receiver` service
   account, or reuse one you stored safely. Save it outside the repository
3. Run a dry run from the repository root. It reads and reports, then rolls
   back without writing:
   ```bash
   yarn --cwd workers/kofi grant --payment <kofiPayments id> --uid <uid> --key <path to key> --dry-run
   ```
   The output names the payment, the uid, the months, the old expiry and the
   new one
4. Run the same command without `--dry-run` to write the grant
5. Delete the key file

The payment id is the document id under `kofiPayments`. The script takes the
months from the payment. When the payment holds none, as with a
`needs-review` payment in another currency or over GBP 120, add
`--months <n>` with a whole number from 1 to 120. When the payment does
hold months, `--months` must match them or the script refuses

The script refuses a payment that reads `granted` or `already-lifetime`, a
missing payment, and a uid that is unsafe, missing or disabled. Each
refusal writes nothing. A rerun after a stop, an abort or a success is
therefore safe, because every run checks the payment's status again inside a
fresh transaction

On success the payment gets `status` set to `granted` (or `already-lifetime`
when the user already has lifetime access), plus `uid`, `matchedBy` set to
`manual`, `months` and `grantedAt`. The script leaves `tipTotals` alone,
because the Worker counted the tip when it arrived. It never prints the key,
the access token or the signed assertion
