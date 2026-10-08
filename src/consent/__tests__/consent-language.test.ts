import { describe, expect, it } from "vitest";
import { toConsentLanguage } from "../consent-language";

describe("toConsentLanguage", () => {
  it.each([
    ["en", "en"],
    ["de", "de"],
    ["es", "es"],
    ["fr", "fr"],
    ["it", "it"],
    ["pt", "pt"],
    ["ro", "ro"],
    ["zh-CN", "zh"],
    ["zh-TW", "en"],
    ["ja", "en"],
    ["ko", "en"],
    [undefined, "en"],
    ["xx", "en"],
  ])("maps app language %s to %s", (appLanguage, consentLanguage) => {
    expect(toConsentLanguage(appLanguage)).toBe(consentLanguage);
  });
});
