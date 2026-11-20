import { describe, expect, it } from "vitest";
import en from "../en_translation.json";

const locales = import.meta.glob<{ userAccount: { signInFailed: string } }>("../*_translation.json", { eager: true, import: "default" });
const entries = Object.entries(locales);
const english = en.userAccount.signInFailed;

describe("sign-in failed translations", () => {
  it.each(entries)("%s has a non-empty, trimmed signInFailed", (_path, locale) => {
    const message = locale.userAccount.signInFailed;
    expect(typeof message).toBe("string");
    expect(message.trim()).not.toBe("");
    expect(message).toBe(message.trim());
  });

  it.each(entries)("%s hides raw provider detail", (_path, locale) => {
    const message = locale.userAccount.signInFailed;
    expect(message).not.toContain("auth/");
    expect(message).not.toContain("Firebase");
    expect(message).not.toContain("FirebaseError");
  });

  it.each(entries.filter(([path]) => !path.endsWith("/en_translation.json")))("%s translates signInFailed", (_path, locale) => {
    expect(locale.userAccount.signInFailed).not.toBe(english);
  });
});
