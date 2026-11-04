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

const locales: Record<string, { expansionPage?: Record<string, string> }> = {
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

describe("expansion page copy", () => {
  it.each(Object.entries(locales))("%s has no movement key", (_name, locale) => {
    expect(locale.expansionPage).not.toHaveProperty("metaShare");
  });
});
