# How to collect feedback

The `/feedback` page lets signed-in visitors send a message, a topic and, if they tick the box, their email address for a reply. Submissions land in the `feedback` collection of the project's Firestore database. Signed-out visitors see a sign-in prompt instead of the form, which keeps most bots out before Firestore is involved.

## What the page writes

`submitFeedback` in `src/app/feedback-api.ts` writes two documents in one batch:

- `feedback/{autoId}` with `uid`, `email`, `category`, `message`, `contactOk`, `page` and `createdAt`. `email` is `null` unless the visitor ticked the reply box. `page` is the path the visitor came from when they used the footer link or the link in the account panel, or an empty string.
- `feedbackThrottle/{uid}` with `lastAt`, the server time of that user's latest submission, and `feedbackId`, the id of the message it covers. The rules accept a message only when the throttle write in the same batch names it, so one batch cannot carry two messages.

## Categories

The form offers six: `idea`, `bug`, `data`, `other`, `stripe` (an old subscription) and `payment` (a payment problem). The list lives in `FEEDBACK_CATEGORIES` in `src/app/feedback.ts` and in `isValidFeedback()` in `firestore.rules`, and each one needs a `feedback.categories.<name>` label in every locale. Adding a category means changing all three, and publishing the rules before the site build goes live, because the live rules refuse a category they do not know.

The page also carries a hidden `website` field. Anything that fills it in is treated as a bot: the page shows the success message and writes nothing.

## Security rules

The feedback rules are the `feedback` and `feedbackThrottle` blocks in `firestore.rules`, with the helpers `signedInWithGoogle()`, `feedbackThrottlePath()` and `isValidFeedback()`. They let a user signed in with Google create feedback only as themselves, only with the fields and limits the form uses, and at most once an hour. Nobody can read, edit or delete feedback from the site. You read it in the console.

`yarn test:rules` runs them against the Firestore emulator with the same batch `submitFeedback` commits. After changing the file, the owner publishes it with `firebase deploy --only firestore:rules`, sends one message from the live site and checks that a document appears in `feedback`. The `feedbackId` field must reach the live site and the rules together: deploy the rules right after the site build that writes it goes live, because the older rules refuse a throttle document with that field and the newer rules refuse one without it.

## Read submissions

In the Firebase console, open Firestore Database and the `feedback` collection. Sort by `createdAt` to see the newest first. When `contactOk` is `true`, `email` holds the address to reply to.
