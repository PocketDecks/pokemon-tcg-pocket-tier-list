import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18next from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import Premium from "../Premium";
import en from "../../locales/en_translation.json";
import { CONTACT_EMAIL, KOFI_URL } from "../../app/constants";
import { withQueryClient } from "../../test-utils/with-query-client";

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

const openWithFailedCode = async () => {
  const user = userEvent.setup();
  render(
    <I18nextProvider i18n={i18n}>
      {withQueryClient(<Premium variant="link" linkLabel="Remove ads" />)}
    </I18nextProvider>
  );
  await user.click(screen.getByRole("button", { name: "Remove ads" }));
  const dialog = screen.getByRole("dialog", { name: en.premium.title });
  await user.click(within(dialog).getByRole("button", { name: en.premium.altCodeToggle }));
  return { user, dialog };
};

describe("Premium code failure with the real English resources", () => {
  it("renders the real unavailable line and no paste hint", async () => {
    const { dialog } = await openWithFailedCode();
    const fallback = await within(dialog).findByText(en.premium.codeUnavailable);
    expect(fallback.textContent).toBe(en.premium.codeUnavailable);
    expect(within(dialog).queryByText(en.premium.altCodeHint)).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/PD-/)).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: en.premium.copy })).not.toBeInTheDocument();
  });

  it("keeps the email-first call to action and refund contact while codes are missing", async () => {
    const { dialog } = await openWithFailedCode();
    const cta = within(dialog).getByRole("link", { name: en.premium.cta });
    expect(cta).toHaveAttribute("href", KOFI_URL);
    expect(within(dialog).getByText(en.premium.emailHint.replace("{{email}}", "player@example.com"))).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: CONTACT_EMAIL })).toHaveAttribute(
      "href",
      `mailto:${CONTACT_EMAIL}`
    );
  });
});
