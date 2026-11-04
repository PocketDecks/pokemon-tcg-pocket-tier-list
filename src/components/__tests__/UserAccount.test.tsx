import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import UserAccount from "../UserAccount";
import { useAuth } from "../../contexts/AuthContext";
import useIsPremium from "../../app/use-is-premium";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      (
        {
          "userAccount.title": "User Account",
          "userAccount.signOut": "Sign out",
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
}));

beforeEach(() => {
  vi.mocked(useAuth).mockReturnValue({
    user: {
      uid: "user-1",
      displayName: "Ada Lovelace",
      email: "ada@example.com",
      photoURL: null,
    },
    loading: false,
    signOut: vi.fn(),
    signInWithGoogle: vi.fn(),
  } as unknown as ReturnType<typeof useAuth>);
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
});
