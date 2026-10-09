import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { baseTranslations } from "@c15t/translations/all";
import { consentMessages } from "../consent-messages";

const BUNDLED_TRANSLATIONS_VERSION = "2.3.0";

const BRITISH_ENGLISH_OVERRIDES: Record<string, { american: string; british: string }> = {
  "common.customize": {
    american: "Customize",
    british: "Customise",
  },
  "cookieBanner.description": {
    american:
      "This site uses cookies to improve your browsing experience, analyze site traffic, and show personalized content.",
    british:
      "This site uses cookies to improve your browsing experience, analyse site traffic, and show personalised content.",
  },
  "consentManagerDialog.description": {
    american:
      "Customize your privacy settings here. You can choose which types of cookies and tracking technologies you allow.",
    british:
      "Customise your privacy settings here. You can choose which types of cookies and tracking technologies you allow.",
  },
  "consentTypes.functionality.description": {
    american: "These cookies enable enhanced functionality and personalization of the website.",
    british: "These cookies enable enhanced functionality and personalisation of the website.",
  },
};

const APP_LANGUAGES = ["de", "es", "fr", "it", "pt", "ro", "zh"] as const;

type Leaves = Record<string, string>;

const flatten = (value: unknown, path = ""): Leaves => {
  if (value !== null && typeof value === "object") {
    return Object.entries(value).reduce<Leaves>(
      (leaves, [key, child]) => ({ ...leaves, ...flatten(child, path ? `${path}.${key}` : key) }),
      {}
    );
  }
  return { [path]: String(value) };
};

const usedSections = (translations: (typeof baseTranslations)["en"]) => ({
  common: translations.common,
  cookieBanner: translations.cookieBanner,
  consentManagerDialog: translations.consentManagerDialog,
  consentTypes: translations.consentTypes,
  legalLinks: { privacyPolicy: translations.legalLinks?.privacyPolicy },
});

describe("consent messages bundled from @c15t/translations 2.3.0", () => {
  it("is generated from the installed @c15t/translations version", () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(process.cwd(), "node_modules/@c15t/translations/package.json"), "utf8")
    ) as { version: string };

    expect(packageJson.version).toBe(BUNDLED_TRANSLATIONS_VERSION);
  });

  it("bundles exactly the languages the app maps to", () => {
    expect(Object.keys(consentMessages).sort()).toEqual(["de", "en", "es", "fr", "it", "pt", "ro", "zh"]);
  });

  it("carries only the British English overrides for en", () => {
    const expected = Object.fromEntries(
      Object.entries(BRITISH_ENGLISH_OVERRIDES).map(([path, { british }]) => [path, british])
    );

    expect(flatten(consentMessages.en)).toEqual(expected);
  });

  it("keeps the c15t American strings that the British overrides replace", () => {
    const base = flatten(baseTranslations.en);

    for (const [path, { american }] of Object.entries(BRITISH_ENGLISH_OVERRIDES)) {
      expect(base[path]).toBe(american);
    }
  });

  it.each(APP_LANGUAGES)("matches c15t's %s copy for the sections the app uses", (language) => {
    const bundled = (consentMessages as Record<string, unknown>)[language];
    const upstream = usedSections(baseTranslations[language]);

    expect(flatten(bundled)).toEqual(flatten(upstream));
  });
});
