import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import UserAccount from "../UserAccount";
import { CONTACT_EMAIL } from "../../app/constants";
import { useAuth } from "../../contexts/AuthContext";
import useIsPremium from "../../app/use-is-premium";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      (
        {
          "userAccount.title": "User Account",
          "userAccount.signOut": "Sign out",
          "premium.features.contact.title": "Contact us",
          "a11y.closePopup": "Close panel",
        } as Record<string, string>
      )[key] ?? key,
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

const signedInUser = {
  uid: "user-1",
  displayName: "Ada Lovelace",
  email: "ada@example.com",
  photoURL: null,
};

const authValue = (user: typeof signedInUser | null) =>
  ({
    user,
    loading: false,
    signOut: vi.fn(),
    signInWithGoogle: vi.fn(),
  }) as unknown as ReturnType<typeof useAuth>;

beforeEach(() => {
  vi.mocked(useAuth).mockReturnValue(authValue(signedInUser));
  vi.mocked(useIsPremium).mockReturnValue(false);
});

describe("UserAccount", () => {
  it("opens the account panel as a named dialog and closes it on Escape", async () => {
    const user = userEvent.setup();
    render(<UserAccount />);

    await user.click(screen.getByRole("button", { name: "Ada Lovelace" }));

    const dialog = screen.getByRole("dialog", { name: "User Account" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveTextContent("ada@example.com");

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ada Lovelace" })).toHaveFocus();
  });

  it("opens the contact panel as a named dialog, closes it on Escape and returns focus to its trigger", async () => {
    vi.mocked(useIsPremium).mockReturnValue(true);
    const user = userEvent.setup();
    render(<UserAccount />);

    const trigger = screen.getByRole("button", { name: "Contact us" });
    await user.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Contact us" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveTextContent(CONTACT_EMAIL);

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("closes the account popup on sign-out so the next sign-in does not reopen it", async () => {
    const user = userEvent.setup();
    const view = render(<UserAccount />);

    await user.click(screen.getByRole("button", { name: "Ada Lovelace" }));
    expect(screen.getByRole("dialog", { name: "User Account" })).toBeInTheDocument();

    vi.mocked(useAuth).mockReturnValue(authValue(null));
    view.rerender(<UserAccount />);
    vi.mocked(useAuth).mockReturnValue(authValue(signedInUser));
    view.rerender(<UserAccount />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes the contact popup on sign-out so the next sign-in does not reopen it", async () => {
    vi.mocked(useIsPremium).mockReturnValue(true);
    const user = userEvent.setup();
    const view = render(<UserAccount />);

    await user.click(screen.getByRole("button", { name: "Contact us" }));
    expect(screen.getByRole("dialog", { name: "Contact us" })).toBeInTheDocument();

    vi.mocked(useAuth).mockReturnValue(authValue(null));
    vi.mocked(useIsPremium).mockReturnValue(false);
    view.rerender(<UserAccount />);
    vi.mocked(useAuth).mockReturnValue(authValue(signedInUser));
    vi.mocked(useIsPremium).mockReturnValue(true);
    view.rerender(<UserAccount />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
