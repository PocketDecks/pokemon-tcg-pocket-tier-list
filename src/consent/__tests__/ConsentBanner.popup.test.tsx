import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConsentBanner, ConsentManagerProvider } from "@c15t/react";
import { useState } from "react";
import Popup from "../../components/Popup";
import { consentMessages } from "../consent-messages";

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

const PopupBesideBanner = () => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)}>
        Open panel
      </button>
      <Popup isOpen={isOpen} header="panel.title" close={() => setIsOpen(false)}>
        <button type="button">Inside action</button>
      </Popup>
    </>
  );
};

beforeEach(() => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  }));
});

describe("consent banner beside an open popup", () => {
  it("keeps the real banner card and its buttons operable while a popup is open", async () => {
    const user = userEvent.setup();
    render(
      <ConsentManagerProvider
        options={{
          mode: "offline",
          legalLinks: { privacyPolicy: { href: "/privacy/", target: "_self" } },
          i18n: { locale: "en", messages: consentMessages },
        }}
      >
        <PopupBesideBanner />
        <ConsentBanner hideBranding legalLinks={["privacyPolicy"]} />
      </ConsentManagerProvider>
    );

    const card = await screen.findByRole("dialog", { name: "We value your privacy" });
    expect(card).toHaveAttribute("aria-modal", "true");

    await user.click(screen.getByRole("button", { name: "Open panel" }));
    expect(screen.getByRole("dialog", { name: "Panel title" })).toBeInTheDocument();

    expect(card.closest("[inert]")).toBeNull();
    for (const name of ["Reject All", "Accept All", "Customise"]) {
      expect(screen.getByRole("button", { name }).closest("[inert]")).toBeNull();
    }
  });
});
