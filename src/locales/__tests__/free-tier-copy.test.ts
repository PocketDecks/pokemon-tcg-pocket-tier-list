import { describe, expect, it } from "vitest";
import en from "../en_translation.json";

type Copy = { deckPage: Record<string, string>; statistics: Record<string, string> };

const locales = import.meta.glob<Copy>("../*_translation.json", { eager: true, import: "default" });
const english = en as unknown as Copy;
const keys = [
  ["deckPage", "matchupsPremium"],
  ["statistics", "movementPremium"],
] as const;

describe("free tier copy", () => {
  it("is written in English", () => {
    for (const [section, key] of keys) {
      expect(english[section][key]?.trim()).toBeTruthy();
    }
  });

  it("is present in every locale file", () => {
    expect(Object.keys(locales)).toHaveLength(11);
  });

  it.each(
    Object.entries(locales)
      .filter(([path]) => !path.endsWith("/en_translation.json"))
      .flatMap(([path, locale]) =>
        keys.map(
          ([section, key]) =>
            [path, `${section}.${key}`, locale[section][key], english[section][key]] as const
        )
      )
  )("%s translates %s", (_path, _key, translated, source) => {
    expect(translated?.trim()).toBeTruthy();
    expect(translated).not.toBe(source);
  });
});
