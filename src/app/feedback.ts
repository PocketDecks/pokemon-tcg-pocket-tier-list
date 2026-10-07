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
