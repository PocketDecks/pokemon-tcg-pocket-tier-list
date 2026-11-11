import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18next from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import Premium from "../Premium";
import en from "../../locales/en_translation.json";
import { CONTACT_EMAIL } from "../../app/constants";

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  loadPremiumCode: vi.fn(),
}));

vi.mock("../../app/use-is-premium", () => ({
  default: () => false,
  usePremiumExpiry: () => null,
}));
vi.mock("../../contexts/AuthContext", () => ({ useAuth: mocks.useAuth }));
vi.mock("../../app/premium-code", () => ({ loadPremiumCode: mocks.loadPremiumCode }));

const i18n = i18next.createInstance();
await i18n.use(initReactI18next).init({
  lng: "en",
  fallbackLng: "en",
  resources: { en: { translation: en } },
  interpolation: { escapeValue: false },
});

beforeEach(() => {
  mocks.useAuth.mockReturnValue({
    user: { uid: "user-1", email: "player@example.com" },
    loading: false,
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
  });
  mocks.loadPremiumCode.mockRejectedValue(new Error("permission-denied"));
});

describe("Premium code failure fallback with the real English resources", () => {
  it("renders the real locale copy naming the payer email and a support contact", async () => {
    const user = userEvent.setup();
    render(
      <I18nextProvider i18n={i18n}>
        <Premium variant="link" linkLabel="Remove ads" />
      </I18nextProvider>
    );

    await user.click(screen.getByRole("button", { name: "Remove ads" }));
    const dialog = screen.getByRole("dialog", { name: en.premium.title });
    const fallback = await within(dialog).findByText(en.premium.codeError);

    expect(fallback.textContent).toBe(en.premium.codeError);
    expect(en.premium.codeError).toContain("as the payer email at Ko-fi checkout");
    expect(en.premium.codeError).toContain("An email written in the Ko-fi message is not read");
    expect(en.premium.codeError).not.toMatch(/in your Ko-fi message/);
    expect(within(dialog).getByRole("link", { name: CONTACT_EMAIL })).toHaveAttribute(
      "href",
      `mailto:${CONTACT_EMAIL}`
    );
  });
});
