import { collection, doc, getFirestore, serverTimestamp, writeBatch } from "firebase/firestore";
import app from "../config/firebase";

export const FEEDBACK_CATEGORIES = ["idea", "bug", "data", "other"] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

export const FEEDBACK_MIN_LENGTH = 10;
export const FEEDBACK_MAX_LENGTH = 2000;
export const FEEDBACK_PAGE_MAX_LENGTH = 200;

export interface FeedbackSubmission {
  uid: string;
  email: string | null;
  category: FeedbackCategory;
  message: string;
  contactOk: boolean;
  page: string;
}

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
