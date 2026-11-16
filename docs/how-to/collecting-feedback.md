# How to collect feedback

The `/feedback` page lets signed-in visitors send a message, a topic and, if they tick the box, their email address for a reply. Submissions land in the `feedback` collection of the project's Firestore database. Signed-out visitors see a sign-in prompt instead of the form, which keeps most bots out before Firestore is involved.

## What the page writes

`submitFeedback` in `src/app/feedback-api.ts` writes two documents in one batch:

- `feedback/{autoId}` with `uid`, `email`, `category`, `message`, `contactOk`, `page` and `createdAt`. `email` is `null` unless the visitor ticked the reply box. `page` is the path the visitor came from when they used the footer link, or an empty string.
- `feedbackThrottle/{uid}` with `lastAt`, the server time of that user's latest submission.

The page also carries a hidden `website` field. Anything that fills it in is treated as a bot: the page shows the success message and writes nothing.

## Security rules

The feedback rules are the `feedback` and `feedbackThrottle` blocks in `firestore.rules`, with the helpers `signedInWithGoogle()`, `feedbackThrottlePath()` and `isValidFeedback()`. They let a user signed in with Google create feedback only as themselves, only with the fields and limits the form uses, and at most once an hour. Nobody can read, edit or delete feedback from the site. You read it in the console.

`yarn test:rules` runs them against the Firestore emulator with the same batch `submitFeedback` commits. After changing the file, the owner publishes it with `firebase deploy --only firestore:rules`, sends one message from the live site and checks that a document appears in `feedback`.

## Read submissions

In the Firebase console, open Firestore Database and the `feedback` collection. Sort by `createdAt` to see the newest first. When `contactOk` is `true`, `email` holds the address to reply to.
