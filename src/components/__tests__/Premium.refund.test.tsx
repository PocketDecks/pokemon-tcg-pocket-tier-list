import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createInstance } from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import Premium from "../Premium";
import en from "../../locales/en_translation.json";
import { CONTACT_EMAIL } from "../../app/constants";
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

const i18n = createInstance();
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
  mocks.loadPremiumCode.mockResolvedValue("PD-ABC234");
});

describe("Premium refund contact rendering", () => {
  it("renders the real contact address as the refund link text", async () => {
    const user = userEvent.setup();
    render(
      <I18nextProvider i18n={i18n}>
        {withQueryClient(<Premium variant="link" linkLabel="Remove ads" />)}
      </I18nextProvider>
    );

    await user.click(screen.getByRole("button", { name: "Remove ads" }));
    const refundLink = await screen.findByRole("link", { name: CONTACT_EMAIL });
    expect(refundLink).toHaveAttribute("href", `mailto:${CONTACT_EMAIL}`);
  });

  it("interpolates the real English email hint with the signed-in address", async () => {
    const user = userEvent.setup();
    render(
      <I18nextProvider i18n={i18n}>
        {withQueryClient(<Premium variant="link" linkLabel="Remove ads" />)}
      </I18nextProvider>
    );

    await user.click(screen.getByRole("button", { name: "Remove ads" }));
    expect(
      screen.getByText(en.premium.emailHint.replace("{{email}}", "player@example.com"))
    ).toBeInTheDocument();
  });
});
