import { collection, doc, getFirestore, serverTimestamp, writeBatch } from "firebase/firestore";
import app from "../config/firebase";
import type { FeedbackSubmission } from "./feedback";

export const submitFeedback = async (submission: FeedbackSubmission): Promise<void> => {
  const db = getFirestore(app);
  const batch = writeBatch(db);
  batch.set(doc(collection(db, "feedback")), {
    ...submission,
    createdAt: serverTimestamp(),
  });
  batch.set(doc(db, "feedbackThrottle", submission.uid), {
    lastAt: serverTimestamp(),
  });
  await batch.commit();
};
