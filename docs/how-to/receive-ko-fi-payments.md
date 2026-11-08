# How-to guide: Receiving Ko-fi payments

The Cloudflare Worker in `workers/kofi/` takes Ko-fi's payment webhooks and
writes Premium access to Firestore. Each whole GBP 1 in a tip buys one
calendar month, and a second tip adds its months to the end of the first

The Worker deploys on its own, so it can go live before the site reads
Premium from `entitlements`

## What the Worker does

Ko-fi sends a `POST` whose form body has one field, `data`, holding JSON. The
Worker answers `POST /kofi` and, once you set the admin token,
`POST /admin/grant`. It returns 404 for any other method or path

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
5. Add the third secret, `KOFI_ADMIN_TOKEN`, which switches on the grant
   endpoint described under "Granting a payment by hand". Generate it into
   a file in `private/`, which Git ignores, then send the file to
   Cloudflare. Neither command prints the token:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))" > private/kofi-admin-token
   yarn --cwd workers/kofi wrangler secret put KOFI_ADMIN_TOKEN < private/kofi-admin-token
   ```
   Without this secret, or with one shorter than 32 characters, the
   endpoint answers 404 as if it did not exist
6. On ko-fi.com/manage/webhooks, set the webhook URL to
   `https://pocketdecks-kofi.<account subdomain>.workers.dev/kofi`, using the
   subdomain shown under Workers & Pages, and send a test
7. Once the DNS zone moves to the new Cloudflare account, the URL can change
   to `api.pocketdecks.top/kofi`. That needs a route in `wrangler.toml` and
   a redeploy. Put the `routes` line near the top of the file, above the
   first `[observability]` table, because TOML would otherwise read it as
   part of the last table:
   ```toml
   routes = [{ pattern = "api.pocketdecks.top/kofi", zone_name = "pocketdecks.top" }]
   ```

## Running it locally

Copy `workers/kofi/.dev.vars.example` to `workers/kofi/.dev.vars`, fill in
the values (leave `KOFI_ADMIN_TOKEN` empty to keep the grant endpoint off)
and run `yarn --cwd workers/kofi dev`. Git ignores `.dev.vars`,
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

A tip needs a person when the Worker marks it `unmatched` (no account for
the tipper's email) or `needs-review` (not a GBP tip, or over GBP 120). The
`grant` command credits such a payment to the user you pick. It reuses the
Worker's own code, so it stacks months, leaves lifetime access alone and
applies the 2100 rule the same way. It runs in one Firestore transaction:
it reads the payment and the entitlement, then commits both writes
together. If the Worker touches the entitlement in the meantime, Firestore
aborts the commit and nothing changes

The command sends the request to the live Worker, so you need no Google
key. It proves who you are with the admin token from the secrets step,
which sits in `private/kofi-admin-token`

### Step by step

1. Find the payment. Open the Firebase console, choose Firestore Database
   and open the `kofiPayments` collection. Click the document for the tip.
   Its id is the document's name, for example `txn123-msg456`. Then read
   four fields:
   - `status` must say `unmatched` or `needs-review`
   - `email` and `message` show who sent the tip
   - `months` shows how many months it earns. A `months` of 0 means you
     pick the number yourself in step 4
2. Find the account. The simplest way is the account email, because the
   command looks the account up for you. It must be the email the person
   signed up with, which can differ from the one Ko-fi sent. The message
   often names it. The email must belong to exactly one account that is
   verified and not disabled. To use a uid instead, open Authentication in
   the Firebase console, find the user and copy the User UID column
3. Run a dry run from the repository root. Replace the two placeholders
   and keep the rest. A dry run reads and reports, then writes nothing:
   ```bash
   yarn --cwd workers/kofi grant --payment <payment id> --email <account email> --token-file private/kofi-admin-token --dry-run
   ```
   To use a uid, swap `--email <account email>` for `--uid <uid>`. Give
   exactly one of the two
4. Read the summary. It looks like this:
   ```
   Dry run: nothing was written
   payment: txn123-msg456
   uid: <the account's uid>
   months: 5
   result: granted
   old expiry: none
   new expiry: 2027-04-08T12:00:00.000Z
   ```
   Check three things. The uid must belong to the person you meant. The
   months must match what they paid for. The new expiry must sit that many
   months after the old expiry, or after today when the old expiry is
   `none` or already past. A result of `already-lifetime` means the user
   has lifetime access, so the real run marks the payment and leaves the
   entitlement alone. When the payment stores no months, the command
   refuses and asks for `--months <n>`, a whole number from 1 to 120. Add
   it to the command and run the dry run again. When the payment does
   store months, `--months` must match them or the command refuses
5. Run the same command without `--dry-run`. The first line of the output
   then reads `Grant written`
6. Check the result in the Firebase console. `kofiPayments/<id>` now shows
   `status` as `granted` (or `already-lifetime`), with `uid`, `matchedBy`
   set to `manual`, `months` and `grantedAt`. `entitlements/<uid>` shows
   `premium` as true, `source` as `kofi` and an `expiresAt` equal to the
   new expiry from the summary

The command leaves `tipTotals` alone, because the Worker counted the tip
when it arrived

### Fixing problems

A usage error exits with code 2 and every other failure exits with 1. None
of them writes anything. A rerun is always safe, because each run checks
the payment's status again inside a fresh transaction

- Exit code 2 with the usage text means a mistyped command. The line above
  the usage names the problem. Common causes are giving both `--uid` and
  `--email`, giving neither, and leaving out `--token-file`
- "The token file could not be read" or "is empty" means the path is wrong.
  Run the command from the repository root, where `private/kofi-admin-token`
  exists
- "The Worker rejected the token (401)" means the file does not match the
  `KOFI_ADMIN_TOKEN` secret. Generate a new token and set the secret again,
  as in the last secrets step
- "The Worker has no admin endpoint (404)" means the Worker does not know
  the route. Check that the secret is set and holds at least 32
  characters, that you deployed the Worker after this feature landed and
  that `--url` points at the right Worker
- "Refused: no single verified, enabled account for that email" means the
  email matched no account, several accounts, an unverified account or a
  disabled one. Find the uid in Authentication and use `--uid`
- "Refused: Payment ... has status granted" (or `already-lifetime`) means
  someone already granted it. Check the two documents from step 6. There
  is nothing left to do
- "Refused: Payment ... does not exist" means the payment id has a typo.
  Copy it again from the console
- "Refused: ... so pass --months" means the payment stores no months. Add
  `--months <n>`
- "Refused: No active account exists for uid ..." means the uid is wrong
  or the account is disabled
- "The Worker answered 500" or "Grant failed" with a cause means Google
  failed. The Worker's log line in the Cloudflare dashboard names the
  failing call and its status. Wait a minute and run the command again

### Without the Worker

The command can also write to Firestore directly with a service account
key. In Google Cloud, create a JSON key for `kofi-receiver` and save it
outside the repository. Replace `--token-file private/kofi-admin-token`
with `--key <path to key>`. This mode accepts `--email` too, and resolves
it before the transaction. Delete the key file afterwards

### How the endpoint behaves

The command posts JSON to `/admin/grant` with the header
`Authorization: Bearer <token>`. The body holds `payment`, exactly one of
`uid` or `email`, and optionally `months` and `dryRun`. The Worker
compares the token in constant time before it reads the body or calls
Google. It trims and lower-cases the email, then asks Identity Toolkit
for exactly one verified, enabled account

The Worker answers with one of these statuses:

- 200 carries JSON with `payment`, `uid`, `months`, `status`,
  `previousExpiry`, `newExpiry` and `dryRun`
- 400 means the body is not valid JSON or has bad fields
- 401 means the token is missing or wrong
- 404 means no admin token is set, or no single account matches the email
- 409 means the Worker refused the grant, for example because the payment
  is already granted
- 413 means the body passes 16 KiB
- 500 means Google failed

The Worker writes one log line per call, holding the payment id and the
result. It never logs the token, the email or the key. The `/kofi` route
behaves as before
