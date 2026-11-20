import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  callback: null as ((user: { uid: string; displayName: string; photoURL: null } | null) => void) | null,
}));

vi.mock("firebase/auth", () => ({
  onAuthStateChanged: vi.fn((_auth, callback) => {
    authState.callback = callback;
    callback(null);
    return vi.fn();
  }),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("../../config/firebase", () => ({ auth: {}, googleProvider: {} }));
vi.mock("../../app/use-is-premium", () => ({
  default: vi.fn(() => false),
  usePremiumExpiry: vi.fn(() => null),
}));
vi.mock("../../app/premium-code", () => ({ loadPremiumCode: vi.fn() }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      (
        {
          "header.signIn": "Sign in with Google",
          "userAccount.signInFailed": "Sign-in failed. Try again.",
        } as Record<string, string>
      )[key] ?? key,
  }),
  Trans: () => null,
}));

import { signInWithPopup } from "firebase/auth";
import { AuthProvider } from "../../contexts/AuthContext";
import UserAccount from "../UserAccount";
import { withQueryClient } from "../../test-utils/with-query-client";

const rejection = (code: string) => Object.assign(new Error(`Firebase: Error (${code}).`), { code });

const renderAccount = () =>
  render(
    withQueryClient(
      <AuthProvider>
        <UserAccount />
      </AuthProvider>
    )
  );

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(signInWithPopup).mockReset();
});

describe("UserAccount sign-in retry", () => {
  it("announces a rejected sign-in, keeps focus on the button and clears the notice after a successful retry", async () => {
    vi.mocked(signInWithPopup).mockRejectedValueOnce(rejection("auth/internal-error"));
    const user = userEvent.setup();
    renderAccount();

    const button = screen.getByRole("button", { name: "Sign in with Google" });
    await user.click(button);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Sign-in failed. Try again.");
    expect(button).toHaveAttribute("aria-describedby", alert.id);
    expect(button).toHaveFocus();

    vi.mocked(signInWithPopup).mockResolvedValueOnce({} as never);
    await user.click(button);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    act(() => authState.callback?.({ uid: "user-1", displayName: "Ada", photoURL: null }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Sign in with Google" })).not.toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("leaves a single notice after repeated failed attempts", async () => {
    vi.mocked(signInWithPopup).mockRejectedValue(rejection("auth/internal-error"));
    const user = userEvent.setup();
    renderAccount();

    const button = screen.getByRole("button", { name: "Sign in with Google" });
    await user.click(button);
    await screen.findByRole("alert");
    await user.click(button);
    await user.click(button);

    await waitFor(() => expect(screen.getAllByRole("alert")).toHaveLength(1));
  });

  it("shows no notice when the popup is closed on purpose", async () => {
    vi.mocked(signInWithPopup).mockRejectedValueOnce(rejection("auth/popup-closed-by-user"));
    const user = userEvent.setup();
    renderAccount();

    await user.click(screen.getByRole("button", { name: "Sign in with Google" }));

    await waitFor(() => expect(signInWithPopup).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
