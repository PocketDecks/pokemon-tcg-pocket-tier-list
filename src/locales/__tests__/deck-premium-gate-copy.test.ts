import { describe, expect, it } from "vitest";
import en from "../en_translation.json";

type GateCopy = { deckPage: Record<string, string> };

const locales = import.meta.glob<GateCopy>("../*_translation.json", { eager: true, import: "default" });
const keys = ["premiumGateTitle", "premiumGateBody", "premiumGateAction"] as const;
const english = en as unknown as GateCopy;

describe("deck premium gate copy", () => {
  it("is written in English", () => {
    for (const key of keys) {
      expect(english.deckPage[key].trim()).not.toBe("");
    }
  });

  it("is present in every locale file", () => {
    expect(Object.keys(locales)).toHaveLength(11);
  });

  it.each(
    Object.entries(locales)
      .filter(([path]) => !path.endsWith("/en_translation.json"))
      .flatMap(([path, locale]) =>
        keys.map((key) => [path, key, locale.deckPage[key], english.deckPage[key]] as const)
      )
  )("%s translates deckPage.%s", (_path, _key, translated, source) => {
    expect(translated?.trim()).toBeTruthy();
    expect(translated).not.toBe(source);
  });
});
