# How to collect feedback

The `/feedback` page lets signed-in visitors send a message and a topic. The form stores their account email so we can reply, and it will not send until they tick a box saying they have read the privacy policy and agree to it. Submissions land in the `feedback` collection of the project's Firestore database. Signed-out visitors see a sign-in prompt instead of the form, which keeps most bots out before Firestore is involved.

## What the page writes

`submitFeedback` in `src/app/feedback-api.ts` writes two documents in one batch:

- `feedback/{autoId}` with `uid`, `email`, `category`, `message`, `contactOk`, `page` and `createdAt`. `email` is always the visitor's own account email, and `contactOk` is always `true`: it records that they ticked the agreement box. `page` is the path the visitor came from when they used the footer link or the link in the account panel, or an empty string.
- `feedbackThrottle/{uid}` with `lastAt`, the server time of that user's latest submission, and `feedbackId`, the id of the message it covers. The rules accept a message only when the throttle write in the same batch names it, so one batch cannot carry two messages.

## Categories

The form offers eight, in this order: `idea`, `bug`, `data`, `stripe` (an old Stripe subscription), `payment` (a payment problem), `partnership` (a partnership or collaboration offer), `translation` (a translation mistake) and `other`, which stays last. The list lives in `FEEDBACK_CATEGORIES` in `src/app/feedback.ts` and in `isValidFeedback()` in `firestore.rules`. Each category also needs an icon in `CATEGORY_ICONS` in `src/pages/feedback/FeedbackPage.tsx`, which the compiler enforces, and a `feedback.categories.<name>` label in every locale. A link can preselect a category with `?category=<name>`, as the refund line in the Supporter popup does with `payment`, and an unknown name is ignored. Adding a category means changing all four, and publishing the rules before the site build goes live, because the live rules refuse a category they do not know.

The page also carries a hidden `website` field. Anything that fills it in is treated as a bot: the page shows the success message and writes nothing.

## Security rules

The feedback rules are the `feedback` and `feedbackThrottle` blocks in `firestore.rules`, with the helpers `signedInWithGoogle()`, `feedbackThrottlePath()` and `isValidFeedback()`. They let a user signed in with Google read their own `feedbackThrottle/{uid}` document so the page can check the hour, while reads by anyone else stay refused. They let the same user create feedback only as themselves, with their own email and the agreement recorded, only with the fields and limits the form uses, and at most once an hour. Nobody can read, edit or delete feedback from the site. You read it in the console.

The page reads the signed-in user's own `feedbackThrottle/{uid}` document before sending. If that read fails, the page treats the throttle time as unknown and sends, and the rules still enforce the hour. The rules and the site can therefore ship in either order. The live rules are published by hand, so they can lag main; the owner checks them after any change to `firestore.rules`. `yarn test:rules` runs the rules against the Firestore emulator with the same batch `submitFeedback` commits. After changing the file, the owner publishes it with `firebase deploy --only firestore:rules`, sends one message from the live site and checks that a document appears in `feedback`.

## Read submissions

In the Firebase console, open Firestore Database and the `feedback` collection. Sort by `createdAt` to see the newest first. When `contactOk` is `true`, `email` holds the address to reply to.
