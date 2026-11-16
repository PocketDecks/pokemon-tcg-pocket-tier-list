import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18next from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { MemoryRouter } from "react-router";
import PremiumPage from "../../pages/premium/PremiumPage";
import { ContentReadyProvider } from "../../ads/ContentReadyContext";
import en from "../../locales/en_translation.json";
import { KOFI_URL } from "../../app/constants";
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

const signIn = (uid: string) => ({
  user: { uid, email: `${uid}@example.com` },
  loading: false,
  signInWithGoogle: vi.fn(),
  signOut: vi.fn(),
});

const page = () => (
  <I18nextProvider i18n={i18n}>
    <MemoryRouter initialEntries={["/premium"]}>
      <ContentReadyProvider>{withQueryClient(<PremiumPage />)}</ContentReadyProvider>
    </MemoryRouter>
  </I18nextProvider>
);

beforeEach(() => {
  mocks.loadPremiumCode.mockImplementation(async (uid: string) => (uid === "user-1" ? "PD-USER1A" : "PD-USER2B"));
});

describe("the premium page after an account switch", () => {
  it("drops the code and the waiting state of the previous account", async () => {
    const user = userEvent.setup();
    mocks.useAuth.mockReturnValue(signIn("user-1"));
    const { rerender } = render(page());

    await user.click(screen.getByRole("link", { name: en.premium.cta }));
    expect(screen.getByRole("link", { name: en.premium.cta })).toHaveAttribute("href", KOFI_URL);
    expect(screen.getByRole("status")).toHaveTextContent(en.premium.waiting);

    await user.click(screen.getByRole("button", { name: en.premium.altCodeToggle }));
    expect(await screen.findByText("PD-USER1A")).toBeInTheDocument();

    mocks.useAuth.mockReturnValue(signIn("user-2"));
    rerender(page());

    expect(screen.queryByText(en.premium.waiting)).toBeNull();
    expect(screen.getByRole("button", { name: en.premium.altCodeToggle })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("PD-USER1A")).toBeNull();

    await user.click(screen.getByRole("button", { name: en.premium.altCodeToggle }));
    await waitFor(() => expect(screen.getByText("PD-USER2B")).toBeInTheDocument());
    expect(mocks.loadPremiumCode).toHaveBeenCalledWith("user-2");
  });
});
