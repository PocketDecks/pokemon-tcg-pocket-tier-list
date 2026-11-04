import { describe, expect, it } from "vitest";
import en from "../en_translation.json";
import de from "../de_translation.json";
import es from "../es_translation.json";
import fr from "../fr_translation.json";
import itTranslation from "../it_translation.json";
import ja from "../ja_translation.json";
import ko from "../ko_translation.json";
import pt from "../pt_translation.json";
import ro from "../ro_translation.json";
import zhCN from "../zh-CN_translation.json";
import zhTW from "../zh-TW_translation.json";

const locales: Record<string, { expansionPage: Record<string, string> }> = {
  en,
  de,
  es,
  fr,
  it: itTranslation,
  ja,
  ko,
  pt,
  ro,
  "zh-CN": zhCN,
  "zh-TW": zhTW,
};

const PAGE_KEYS = ["breadcrumb", "cardsHeading", "decksHeading", "empty", "emptyAside", "expansions", "heading", "home", "intro", "loadError", "released"];

describe("expansion page copy", () => {
  it.each(Object.entries(locales))("%s has exactly the expansion page keys in use", (_name, locale) => {
    expect(Object.keys(locale.expansionPage).sort()).toEqual(PAGE_KEYS);
  });

  it.each(Object.entries(locales))("%s heading names the set and its ID", (_name, locale) => {
    expect(locale.expansionPage.heading).toContain("{{name}}");
    expect(locale.expansionPage.heading).toContain("{{id}}");
  });

  it.each(Object.entries(locales))("%s release line takes the date", (_name, locale) => {
    expect(locale.expansionPage.released).toContain("{{date}}");
  });

  it.each(Object.entries(locales))("%s intro takes the set name", (_name, locale) => {
    expect(locale.expansionPage.intro).toContain("{{name}}");
  });

  it("uses the English heading and intro wording", () => {
    expect(en.expansionPage.heading).toBe("{{name}} ({{id}}) Cards & Decks");
    expect(en.expansionPage.released).toBe("Released {{date}}");
    expect(en.expansionPage.intro).toBe(
      "Cards from {{name}} that appear in current tournament decks, and the decks that play them."
    );
  });

  it("states the empty sentence plainly, without exclamation marks or dashes", () => {
    expect(en.expansionPage.empty).toBe("None of the {{name}} cards are in a top deck right now.");
    for (const locale of Object.values(locales)) {
      expect(locale.expansionPage.empty).toContain("{{name}}");
      expect(locale.expansionPage.empty).not.toMatch(/[!—–]/);
    }
  });

  it("uses the Italian home label and a localised breadcrumb name", () => {
    expect(itTranslation.expansionPage.home).toBe("Pagina iniziale");
    expect(en.expansionPage.breadcrumb).toBe("Breadcrumb");
  });

  it("writes the Japanese heading in Japanese", () => {
    expect(ja.expansionPage.heading).toMatch(/[\u3040-\u30ff\u4e00-\u9faf]/);
    expect(ja.expansionPage.heading).not.toMatch(/Cards & Decks/);
  });
});
