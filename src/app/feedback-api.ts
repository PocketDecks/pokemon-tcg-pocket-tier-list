import { collection, doc, getFirestore, serverTimestamp, writeBatch } from "firebase/firestore";
import app from "../config/firebase";
import type { FeedbackSubmission } from "./feedback";

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
