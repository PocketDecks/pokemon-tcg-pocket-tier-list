import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import SignInFailedNotice from "../SignInFailedNotice";
import { useAuth } from "../../app/use-auth";
import type { User } from "firebase/auth";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => ({ "userAccount.signInFailed": "Sign-in failed. Try again." })[key] ?? key,
  }),
}));

vi.mock("../../app/use-auth", () => ({ useAuth: vi.fn() }));

const authValue = (user: User | null, signInFailed: boolean): ReturnType<typeof useAuth> => ({
  user,
  loading: false,
  signInFailed,
  signInWithGoogle: vi.fn(),
  signOut: vi.fn(),
});

const signedInUser = { uid: "user-1" } as User;

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
    vi.mocked(useAuth).mockReturnValue(authValue(signedInUser, true));
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
