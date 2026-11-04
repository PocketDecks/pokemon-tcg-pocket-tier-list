import { describe, expect, it } from "vitest";
import en from "../en_translation.json";
import fr from "../fr_translation.json";
import pt from "../pt_translation.json";

const locales = import.meta.glob<{ loadError: Record<string, string> }>("../*_translation.json", { eager: true, import: "default" });
const keys = Object.keys(en.loadError) as (keyof typeof en.loadError)[];

describe("load error translations", () => {
  it.each(Object.entries(locales).filter(([path]) => !path.endsWith("/en_translation.json")).flatMap(([path, locale]) =>
    keys.map((key) => [path, key, locale.loadError[key], en.loadError[key]] as const)
  ))("%s translates loadError.%s", (_path, _key, translated, english) => {
    expect(translated.trim()).not.toBe("");
    expect(translated).not.toBe(english);
  });

  it("uses formal French", () => expect(fr.loadError.message).toContain("Réessayez."));
  it("uses formal Portuguese", () => expect(pt.loadError.message).toContain("Tente novamente."));
});
