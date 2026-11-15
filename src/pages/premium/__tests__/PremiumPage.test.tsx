import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../../../i18n";
import en from "../../../locales/en_translation.json";
import PremiumPage from "../PremiumPage";
import useIsPremium, { usePremiumExpiry } from "../../../app/use-is-premium";
import { useAuth } from "../../../contexts/AuthContext";
import { KOFI_URL } from "../../../app/constants";
import { withQueryClient } from "../../../test-utils/with-query-client";

vi.mock("../../../ads/ContentReadyContext", () => ({
  __esModule: true,
  useMarkContentReady: vi.fn(),
}));
vi.mock("../../../app/use-is-premium", () => ({ default: vi.fn(), usePremiumExpiry: vi.fn() }));
vi.mock("../../../app/premium-code", () => ({ loadPremiumCode: vi.fn() }));
vi.mock("../../../contexts/AuthContext", () => ({ useAuth: vi.fn() }));

const authValue = (user: { uid: string; email: string | null } | null) =>
  ({ user, loading: false, signInWithGoogle: vi.fn(), signOut: vi.fn() }) as ReturnType<typeof useAuth>;

const renderPage = () =>
  render(withQueryClient(<MemoryRouter><PremiumPage /></MemoryRouter>));

describe("PremiumPage", () => {
  beforeAll(async () => {
    await i18n.init();
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    vi.mocked(useIsPremium).mockReturnValue(false);
    vi.mocked(usePremiumExpiry).mockReturnValue(null);
    vi.mocked(useAuth).mockReturnValue(authValue(null));
  });

  it("renders the shared Supporter body for a signed-out visitor", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: en.premium.become })).toBeInTheDocument();
    expect(screen.getByText(en.premium.price)).toBeInTheDocument();
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual(
      Object.values(en.premium.perks)
    );
    expect(screen.getByRole("button", { name: en.premium.signIn })).toBeInTheDocument();
    expect(screen.getByText(en.premium.rulesToggle)).toBeInTheDocument();
  });

  it("offers the Ko-fi button to a signed-in visitor", () => {
    vi.mocked(useAuth).mockReturnValue(authValue({ uid: "u1", email: "a@example.com" }));
    renderPage();
    const page = screen.getByRole("article");
    expect(within(page).getByRole("link", { name: en.premium.cta })).toHaveAttribute("href", KOFI_URL);
    expect(within(page).getByText(en.premium.emailHint.replace("{{email}}", "a@example.com"))).toBeInTheDocument();
  });

  it("shows the expiry state under the Supporter heading", () => {
    vi.mocked(useIsPremium).mockReturnValue(true);
    vi.mocked(usePremiumExpiry).mockReturnValue(Date.UTC(2027, 0, 2));
    vi.mocked(useAuth).mockReturnValue(authValue({ uid: "u1", email: "a@example.com" }));
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: en.premium.title })).toBeInTheDocument();
    expect(screen.getByText(/Your Supporter access ends on/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: en.premium.ctaExtend })).toBeInTheDocument();
  });
});
