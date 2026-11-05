import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { StrictMode } from "react";
import Popup from "../../components/Popup";
import { openPopupCount } from "../../components/popup-state";
import { useClearConsentPending } from "../use-clear-consent-pending";
import { CONSENT_PENDING_ATTRIBUTE } from "../consent-pending-keys.mjs";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const ConsentSettles = ({ settled }: { settled: boolean }) => {
  useClearConsentPending(settled);
  return null;
};

const scene = (settled: boolean, isOpen: boolean) => (
  <>
    <ConsentSettles settled={settled} />
    <Popup isOpen={isOpen} header="Title" close={() => undefined}>
      <button type="button">Inside</button>
    </Popup>
  </>
);

afterEach(() => {
  document.documentElement.removeAttribute(CONSENT_PENDING_ATTRIBUTE);
});

describe("clearing the consent-pending attribute", () => {
  it("keeps the attribute while a popup is open and removes it once the last popup closes", () => {
    document.documentElement.setAttribute(CONSENT_PENDING_ATTRIBUTE, "");
    const view = render(scene(false, true));

    view.rerender(scene(true, true));
    expect(document.documentElement).toHaveAttribute(CONSENT_PENDING_ATTRIBUTE);

    view.rerender(scene(true, false));
    expect(document.documentElement).not.toHaveAttribute(CONSENT_PENDING_ATTRIBUTE);
  });

  it("removes the attribute straight away when consent settles with no popup open", () => {
    document.documentElement.setAttribute(CONSENT_PENDING_ATTRIBUTE, "");
    render(scene(true, false));

    expect(document.documentElement).not.toHaveAttribute(CONSENT_PENDING_ATTRIBUTE);
  });

  it("removes the attribute when a popup unmounts while open after consent settled", () => {
    document.documentElement.setAttribute(CONSENT_PENDING_ATTRIBUTE, "");
    const view = render(scene(false, true));
    view.rerender(scene(true, true));
    expect(document.documentElement).toHaveAttribute(CONSENT_PENDING_ATTRIBUTE);
    expect(openPopupCount()).toBe(1);

    view.rerender(<ConsentSettles settled />);

    expect(document.documentElement).not.toHaveAttribute(CONSENT_PENDING_ATTRIBUTE);
    expect(openPopupCount()).toBe(0);
  });

  it("does the same under StrictMode", () => {
    document.documentElement.setAttribute(CONSENT_PENDING_ATTRIBUTE, "");
    const view = render(<StrictMode>{scene(false, true)}</StrictMode>);
    view.rerender(<StrictMode>{scene(true, true)}</StrictMode>);
    expect(document.documentElement).toHaveAttribute(CONSENT_PENDING_ATTRIBUTE);
    expect(openPopupCount()).toBe(1);

    view.rerender(
      <StrictMode>
        <ConsentSettles settled />
      </StrictMode>
    );

    expect(document.documentElement).not.toHaveAttribute(CONSENT_PENDING_ATTRIBUTE);
    expect(openPopupCount()).toBe(0);
  });
});
