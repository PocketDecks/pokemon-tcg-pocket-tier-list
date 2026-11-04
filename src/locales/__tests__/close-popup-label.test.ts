import { describe, expect, it } from "vitest";
import en from "../en_translation.json";

const translations = import.meta.glob<{ a11y: { closePopup: string } }>("../*_translation.json", {
  eager: true,
  import: "default",
});

const closeLabel = (data: { a11y: { closePopup: string } }) => data.a11y.closePopup;

describe("the Close label for popups", () => {
  it("is Close in English", () => {
    expect(closeLabel(en)).toBe("Close");
  });

  it("covers all 11 translation files", () => {
    expect(Object.keys(translations)).toHaveLength(11);
  });

  it.each(
    Object.entries(translations).filter(([path]) => !path.endsWith("/en_translation.json"))
  )("is translated in %s", (_path, data) => {
    expect(closeLabel(data)).not.toBe(closeLabel(en));
    expect(closeLabel(data).trim()).not.toBe("");
  });
});
