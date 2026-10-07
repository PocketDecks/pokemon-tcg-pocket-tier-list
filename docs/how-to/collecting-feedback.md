# How to collect feedback

The `/feedback` page lets signed-in visitors send a message, a topic and, if they tick the box, their email address for a reply. Submissions land in the `feedback` collection of the project's Firestore database. Signed-out visitors see a sign-in prompt instead of the form, which keeps most bots out before Firestore is involved.

## What the page writes

`submitFeedback` in `src/app/feedback-api.ts` writes two documents in one batch:

- `feedback/{autoId}` with `uid`, `email`, `category`, `message`, `contactOk`, `page` and `createdAt`. `email` is `null` unless the visitor ticked the reply box. `page` is the path the visitor came from when they used the footer link, or an empty string.
- `feedbackThrottle/{uid}` with `lastAt`, the server time of that user's latest submission.

The page also carries a hidden `website` field. Anything that fills it in is treated as a bot: the page shows the success message and writes nothing.

## Add the security rules

The repository does not deploy Firestore rules. The Stripe extension relies on the rules already in the Firebase console, and deploying a rules file from here would replace them. Add these blocks by hand instead.

1. Open the Firebase console for `pokemon-tcg-pocket-tier-list` and go to Firestore Database, then Rules.
2. Inside the existing `match /databases/{database}/documents { ... }` block, paste the following next to the rules already there. Do not remove anything.

```text
match /feedback/{feedbackId} {
  allow create: if isValidFeedback();
  allow read, update, delete: if false;
}

match /feedbackThrottle/{uid} {
  allow create, update: if signedInWithGoogle()
    && request.auth.uid == uid
    && request.resource.data.keys().hasOnly(['lastAt'])
    && request.resource.data.lastAt == request.time;
  allow read, delete: if false;
}

function signedInWithGoogle() {
  return request.auth != null
    && request.auth.token.firebase.sign_in_provider == 'google.com'
    && request.auth.token.email_verified == true;
}

function feedbackThrottlePath() {
  return /databases/$(database)/documents/feedbackThrottle/$(request.auth.uid);
}

function isValidFeedback() {
  let data = request.resource.data;
  return signedInWithGoogle()
    && data.keys().hasOnly(['uid', 'email', 'category', 'message', 'contactOk', 'page', 'createdAt'])
    && data.keys().hasAll(['uid', 'email', 'category', 'message', 'contactOk', 'page', 'createdAt'])
    && data.uid == request.auth.uid
    && (data.email == null || data.email == request.auth.token.email)
    && data.category in ['idea', 'bug', 'data', 'other']
    && data.message is string
    && data.message.size() >= 10
    && data.message.size() <= 2000
    && data.contactOk is bool
    && data.page is string
    && data.page.size() <= 200
    && data.createdAt == request.time
    && getAfter(feedbackThrottlePath()).data.lastAt == request.time
    && (!exists(feedbackThrottlePath())
      || get(feedbackThrottlePath()).data.lastAt < request.time - duration.value(5, 'm'));
}
```

3. Publish the rules.

These rules let a user signed in with Google create feedback only as themselves, only with the fields and limits the form uses, and at most once every five minutes. Nobody can read, edit or delete feedback from the site. You read it in the console.

The rules have not been run against the Firestore emulator. After publishing, send one message from the live site and check that a document appears in `feedback`. Then send a second message straight away and check that the page shows its error message.

## Read submissions

In the Firebase console, open Firestore Database and the `feedback` collection. Sort by `createdAt` to see the newest first. When `contactOk` is `true`, `email` holds the address to reply to.
