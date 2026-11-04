import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import Popup from "../Popup";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      (
        {
          "a11y.closePopup": "Close panel",
          "panel.title": "Panel title",
        } as Record<string, string>
      )[key] ?? key,
  }),
}));

type StyleRuleInfo = {
  mediaText: string | null;
  selectorText: string;
  declarations: string;
};

const collectStyleRules = (): StyleRuleInfo[] => {
  const rules: StyleRuleInfo[] = [];
  const visit = (cssRules: CSSRuleList, mediaText: string | null) => {
    for (const rule of Array.from(cssRules)) {
      if ("media" in rule) {
        visit((rule as CSSMediaRule).cssRules, (rule as CSSMediaRule).media.mediaText);
      } else if ("selectorText" in rule) {
        const styleRule = rule as CSSStyleRule;
        rules.push({
          mediaText,
          selectorText: styleRule.selectorText,
          declarations: styleRule.style.cssText,
        });
      }
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    visit(sheet.cssRules, null);
  }
  return rules;
};

const consentPendingRules = () =>
  collectStyleRules().filter((rule) => rule.selectorText.includes(":root[data-consent-pending]"));

const isPhoneQuery = (mediaText: string | null) =>
  mediaText !== null && /\(\s*max-width:\s*900px\s*\)/.test(mediaText);

const matchesPhoneRule = (element: Element, declaration: string) =>
  consentPendingRules().some(
    (rule) =>
      isPhoneQuery(rule.mediaText) &&
      rule.declarations.includes(declaration) &&
      element.matches(rule.selectorText)
  );

describe("Popup layout beside the consent banner", () => {
  it("reserves room for the banner on phones only while consent is pending", () => {
    render(
      <Popup isOpen header="Title" close={() => undefined}>
        <button type="button">Inside</button>
      </Popup>
    );
    const dialog = screen.getByRole("dialog");
    const overlay = dialog.parentElement as HTMLElement;

    expect(matchesPhoneRule(overlay, "padding-bottom: 50vh")).toBe(false);
    expect(matchesPhoneRule(dialog, "max-height: calc(50vh - 2.4rem)")).toBe(false);

    document.documentElement.setAttribute("data-consent-pending", "");
    try {
      expect(matchesPhoneRule(overlay, "padding-bottom: 50vh")).toBe(true);
      expect(matchesPhoneRule(dialog, "max-height: calc(50vh - 2.4rem)")).toBe(true);
      expect(consentPendingRules().filter((rule) => rule.mediaText === null)).toEqual([]);
    } finally {
      document.documentElement.removeAttribute("data-consent-pending");
    }
  });
});
