import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import SignInFailedNotice from "../SignInFailedNotice";
import { useAuth } from "../../app/use-auth";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => ({ "userAccount.signInFailed": "Sign-in failed. Try again." })[key] ?? key,
  }),
}));

vi.mock("../../app/use-auth", () => ({ useAuth: vi.fn() }));

const authValue = (user: { uid: string } | null, signInFailed: boolean) =>
  ({ user, signInFailed }) as unknown as ReturnType<typeof useAuth>;

beforeEach(() => {
  vi.mocked(useAuth).mockReturnValue(authValue(null, true));
});

describe("SignInFailedNotice", () => {
  it("renders nothing before a failure", () => {
    vi.mocked(useAuth).mockReturnValue(authValue(null, false));
    render(<SignInFailedNotice id="notice" />);

    expect(screen.queryByText("Sign-in failed. Try again.")).not.toBeInTheDocument();
  });

  it("renders nothing once a user is signed in", () => {
    vi.mocked(useAuth).mockReturnValue(authValue({ uid: "user-1" }, true));
    render(<SignInFailedNotice id="notice" alert />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders a role=alert notice with the given id when asked", () => {
    render(<SignInFailedNotice id="notice" alert />);

    expect(screen.getByRole("alert")).toHaveTextContent("Sign-in failed. Try again.");
    expect(screen.getByRole("alert")).toHaveAttribute("id", "notice");
  });

  it("renders plain text without an alert role by default", () => {
    render(<SignInFailedNotice id="notice" />);

    expect(screen.getByText("Sign-in failed. Try again.")).toHaveAttribute("id", "notice");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
