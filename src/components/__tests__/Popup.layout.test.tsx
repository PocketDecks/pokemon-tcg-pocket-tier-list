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

const stylesheetText = () =>
  Array.from(document.querySelectorAll("style"), (style) => style.textContent ?? "").join("\n");

const classSelector = (element: Element) =>
  Array.from(element.classList, (name) => `.${name}`);

describe("Popup layout beside the consent banner", () => {
  it("reserves room for the banner on phones only while consent is pending", () => {
    render(
      <Popup isOpen header="Title" close={() => undefined}>
        <button type="button">Inside</button>
      </Popup>
    );
    const dialog = screen.getByRole("dialog");
    const overlay = dialog.parentElement as HTMLElement;
    const css = stylesheetText().replace(/\s+/g, " ");
    const scoped = (element: Element, declaration: string) =>
      classSelector(element).some((selector) =>
        css.includes(`:root[data-consent-pending] ${selector}{${declaration}`) ||
        css.includes(`:root[data-consent-pending] ${selector} {${declaration}`)
      );
    expect(scoped(overlay, "padding-bottom:50vh")).toBe(true);
    expect(scoped(dialog, "max-height:calc(50vh - 2.4rem)")).toBe(true);
    expect(css).not.toMatch(/\{[^{}]*padding:1\.2rem;padding-bottom:50vh/);
  });
});
