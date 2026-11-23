import { collection, doc, getDoc, getFirestore, serverTimestamp, writeBatch } from "firebase/firestore";
import app from "../config/firebase";
import type { FeedbackSubmission } from "./feedback";

export const readFeedbackThrottle = async (uid: string): Promise<number | null> => {
  const snapshot = await getDoc(doc(getFirestore(app), "feedbackThrottle", uid));
  const lastAt = snapshot.data()?.lastAt as { toMillis?: () => number } | undefined;
  return lastAt && typeof lastAt.toMillis === "function" ? lastAt.toMillis() : null;
};

export const submitFeedback = async (submission: FeedbackSubmission): Promise<void> => {
  const db = getFirestore(app);
  const batch = writeBatch(db);
  const feedback = doc(collection(db, "feedback"));
  batch.set(feedback, {
    ...submission,
    createdAt: serverTimestamp(),
  });
  // The rules let one throttle write cover one message, named by its id.
  batch.set(doc(db, "feedbackThrottle", submission.uid), {
    lastAt: serverTimestamp(),
    feedbackId: feedback.id,
  });
  await batch.commit();
};
