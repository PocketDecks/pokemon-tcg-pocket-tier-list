import { describe, expect, it } from "vitest";

interface FeedbackBlock {
  categories: Record<string, string>;
  consent: string;
  consentRequired: string;
}

const locales = import.meta.glob<{ feedback: FeedbackBlock }>("../*_translation.json", {
  eager: true,
  import: "default",
});

const CATEGORIES = [
  "idea",
  "bug",
  "data",
  "stripe",
  "payment",
  "partnership",
  "translation",
  "other",
];

describe("feedback copy", () => {
  it.each(Object.entries(locales))("%s lists the eight categories with Something else last", (_path, data) => {
    expect(Object.keys(data.feedback.categories)).toEqual(CATEGORIES);
    for (const key of CATEGORIES) {
      expect(data.feedback.categories[key].trim(), key).not.toBe("");
    }
  });

  it.each(Object.entries(locales))("%s links the privacy policy once in the agreement text", (_path, data) => {
    expect(data.feedback.consent.match(/<0>[^<]+<\/0>/g)).toHaveLength(1);
    expect(data.feedback.consent).not.toMatch(/<[1-9]>/);
    expect(data.feedback.consentRequired.trim()).not.toBe("");
  });

  it.each(Object.entries(locales))("%s no longer carries the optional reply label", (_path, data) => {
    expect(data.feedback).not.toHaveProperty("contactLabel");
  });
});
