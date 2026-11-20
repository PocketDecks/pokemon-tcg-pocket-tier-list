import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import UserAccount from "../UserAccount";
import { useAuth } from "../../contexts/AuthContext";
import useIsPremium, { usePremiumExpiry } from "../../app/use-is-premium";
import { loadPremiumCode } from "../../app/premium-code";
import { withQueryClient } from "../../test-utils/with-query-client";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en" },
    t: (key: string, options?: { email?: string; date?: string }) =>
      (
        {
          "userAccount.title": "User Account",
          "userAccount.signOut": "Sign out",
          "header.signIn": "Sign in with Google",
          "userAccount.signInFailed": "Sign-in failed. Try again.",
          "feedback.title": "Send feedback",
          "userAccount.supporterActive": "Active until {{date}}",
          "userAccount.supporterLifetime": "Active, with no expiry",
          "userAccount.supporterEnded": "Not active. Ended on {{date}}",
          "userAccount.supporterNone": "Not active",
          "premium.title": "Supporter",
          "premium.become": "Become a Supporter!",
          "premium.perksLead": "Supporters get:",
          "premium.price": "£1 a month.",
          "premium.cta": "Tip on Ko-fi",
          "premium.emailHint": "Use the email address on your Google account ({{email}}) at Ko-fi checkout.",
          "premium.refund": "For refunds, email us at <0/>.",
          "a11y.closePopup": "Close panel",
        } as Record<string, string>
      )[key]
        ?.replace("{{email}}", options?.email ?? "")
        .replace("{{date}}", options?.date ?? "") ?? key,
  }),
  Trans: () => null,
}));

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../../app/use-is-premium", () => ({
  default: vi.fn(),
  usePremiumExpiry: vi.fn(() => null),
}));

vi.mock("../../app/premium-code", () => ({ loadPremiumCode: vi.fn() }));

const accountTree = () =>
  withQueryClient(
    <MemoryRouter>
      <UserAccount />
    </MemoryRouter>
  );

const signedInUser = {
  uid: "user-1",
  displayName: "Ada Lovelace",
  email: "ada@example.com",
  photoURL: null,
};

const authValue = (user: typeof signedInUser | null, signInFailed = false) =>
  ({
    user,
    loading: false,
    signInFailed,
    signOut: vi.fn(),
    signInWithGoogle: vi.fn(),
  }) as unknown as ReturnType<typeof useAuth>;

beforeEach(() => {
  vi.mocked(loadPremiumCode).mockResolvedValue("PD-ABC234");
  vi.mocked(useAuth).mockReturnValue(authValue(signedInUser));
  vi.mocked(useIsPremium).mockReturnValue(false);
  vi.mocked(usePremiumExpiry).mockReturnValue(null);
});

describe("UserAccount", () => {
  it("places the Supporter icon above the Google profile for a signed-in user", () => {
    render(accountTree());

    const supporter = screen.getByRole("button", { name: "Become a Supporter!" });
    const profile = screen.getByRole("button", { name: "Ada Lovelace" });
    expect(supporter.compareDocumentPosition(profile) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows no alert while sign-in has not failed", () => {
    vi.mocked(useAuth).mockReturnValue(authValue(null));
    render(accountTree());

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in with Google" })).not.toHaveAttribute("aria-describedby");
  });

  it("announces a failed sign-in and keeps the sign-in button usable as the retry", async () => {
    const auth = authValue(null, true);
    vi.mocked(useAuth).mockReturnValue(auth);
    const user = userEvent.setup();
    render(accountTree());

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Sign-in failed. Try again.");
    const retry = screen.getByRole("button", { name: "Sign in with Google" });
    expect(retry).toHaveAttribute("aria-describedby", alert.id);

    await user.click(retry);

    expect(auth.signInWithGoogle).toHaveBeenCalledTimes(1);
    expect(retry).toHaveFocus();
  });

  it("renders one sign-in button for every width so prerendered markup fits the rail", () => {
    vi.mocked(useAuth).mockReturnValue(authValue(null));
    render(accountTree());

    const buttons = screen.getAllByRole("button", { name: "Sign in with Google" });
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAttribute("title", "Sign in with Google");
  });

  it("lets a signed-in free user open the Supporter popup from the account controls", async () => {
    const user = userEvent.setup();
    render(accountTree());

    await user.click(screen.getByRole("button", { name: "Become a Supporter!" }));
    const dialog = screen.getByRole("dialog", { name: "Become a Supporter!" });
    expect(dialog).toHaveTextContent("£1 a month.");
    expect(within(dialog).getByRole("link", { name: "Tip on Ko-fi" })).toHaveAttribute(
      "href",
      "https://ko-fi.com/dalin"
    );
    expect(loadPremiumCode).not.toHaveBeenCalled();
  });

  it("opens the account panel as a named dialog and closes it on Escape", async () => {
    const user = userEvent.setup();
    render(accountTree());

    await user.click(screen.getByRole("button", { name: "Ada Lovelace" }));

    const dialog = screen.getByRole("dialog", { name: "User Account" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveTextContent("ada@example.com");

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ada Lovelace" })).toHaveFocus();
  });

  it("links the account panel to the feedback form and closes the panel when followed", async () => {
    const user = userEvent.setup();
    render(accountTree());

    await user.click(screen.getByRole("button", { name: "Ada Lovelace" }));
    const dialog = screen.getByRole("dialog", { name: "User Account" });
    const link = within(dialog).getByRole("link", { name: "Send feedback" });
    expect(link).toHaveAttribute("href", "/feedback/");

    await user.click(link);

    expect(screen.queryByRole("dialog", { name: "User Account" })).not.toBeInTheDocument();
  });

  it("has no developer contact icon, even for a supporter", () => {
    vi.mocked(useIsPremium).mockReturnValue(true);
    render(accountTree());

    expect(screen.queryByRole("button", { name: /contact/i })).not.toBeInTheDocument();
  });

  it.each([
    ["an active dated grant", true, Date.UTC(2027, 1, 20, 12), "Active until February 20, 2027"],
    ["a lifetime grant", true, null, "Active, with no expiry"],
    ["a grant that ends beyond the lifetime threshold", true, Date.UTC(2999, 11, 31), "Active, with no expiry"],
    ["a lapsed grant", false, Date.UTC(2026, 2, 15, 12), "Not active. Ended on March 15, 2026"],
    ["no grant at all", false, null, "Not active"],
  ])("shows %s in the account panel", async (_label, premium, expiry, expected) => {
    vi.mocked(useIsPremium).mockReturnValue(premium);
    vi.mocked(usePremiumExpiry).mockReturnValue(expiry);
    const user = userEvent.setup();
    render(accountTree());

    await user.click(screen.getByRole("button", { name: "Ada Lovelace" }));

    const dialog = screen.getByRole("dialog", { name: "User Account" });
    expect(within(dialog).getByText("Supporter")).toBeInTheDocument();
    expect(within(dialog).getByText(expected)).toBeInTheDocument();
  });

  it("leaves the status out while the entitlement is still loading", async () => {
    vi.mocked(useIsPremium).mockReturnValue(null);
    const user = userEvent.setup();
    render(accountTree());

    await user.click(screen.getByRole("button", { name: "Ada Lovelace" }));

    const dialog = screen.getByRole("dialog", { name: "User Account" });
    expect(within(dialog).queryByText("Supporter")).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/Not active|Active/)).not.toBeInTheDocument();
  });

  it("closes the account popup on sign-out so the next sign-in does not reopen it", async () => {
    const user = userEvent.setup();
    const view = render(accountTree());

    await user.click(screen.getByRole("button", { name: "Ada Lovelace" }));
    expect(screen.getByRole("dialog", { name: "User Account" })).toBeInTheDocument();

    vi.mocked(useAuth).mockReturnValue(authValue(null));
    view.rerender(accountTree());
    vi.mocked(useAuth).mockReturnValue(authValue(signedInUser));
    view.rerender(accountTree());

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
