import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  callback: null as ((user: { uid: string } | null) => void) | null,
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

import { signInWithPopup } from "firebase/auth";
import { AuthProvider, useAuth } from "../AuthContext";

const Probe = () => {
  const { signInFailed, signInWithGoogle } = useAuth();
  return (
    <>
      <button onClick={() => signInWithGoogle()}>sign in</button>
      <output data-testid="failed">{String(signInFailed)}</output>
    </>
  );
};

const renderProbe = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </QueryClientProvider>
  );

const rejection = (code: string) => Object.assign(new Error(`Firebase: Error (${code}).`), { code });

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(signInWithPopup).mockReset();
});

describe("sign-in failure state", () => {
  it("flags a rejected sign-in", async () => {
    vi.mocked(signInWithPopup).mockRejectedValue(rejection("auth/internal-error"));
    const user = userEvent.setup();
    renderProbe();

    await user.click(screen.getByRole("button", { name: "sign in" }));

    await waitFor(() => expect(screen.getByTestId("failed")).toHaveTextContent("true"));
  });

  it.each(["auth/popup-closed-by-user", "auth/cancelled-popup-request", "auth/user-cancelled"])(
    "treats %s as a deliberate cancellation without a failure flag",
    async (code) => {
      vi.mocked(signInWithPopup).mockRejectedValue(rejection(code));
      const user = userEvent.setup();
      renderProbe();

      await user.click(screen.getByRole("button", { name: "sign in" }));

      await waitFor(() => expect(signInWithPopup).toHaveBeenCalledTimes(1));
      expect(screen.getByTestId("failed")).toHaveTextContent("false");
    }
  );

  it("clears the flag when a retry starts", async () => {
    vi.mocked(signInWithPopup).mockRejectedValueOnce(rejection("auth/internal-error"));
    const user = userEvent.setup();
    renderProbe();
    await user.click(screen.getByRole("button", { name: "sign in" }));
    await waitFor(() => expect(screen.getByTestId("failed")).toHaveTextContent("true"));

    vi.mocked(signInWithPopup).mockReturnValueOnce(new Promise(() => {}));
    await user.click(screen.getByRole("button", { name: "sign in" }));
    expect(screen.getByTestId("failed")).toHaveTextContent("false");
  });

  it("clears a stale failure once a user signs in", async () => {
    vi.mocked(signInWithPopup).mockRejectedValue(rejection("auth/internal-error"));
    const user = userEvent.setup();
    renderProbe();
    await user.click(screen.getByRole("button", { name: "sign in" }));
    await waitFor(() => expect(screen.getByTestId("failed")).toHaveTextContent("true"));

    act(() => authState.callback?.({ uid: "user-a" }));

    expect(screen.getByTestId("failed")).toHaveTextContent("false");
  });

  it("lets a second click replace a pending sign-in without leaving a notice", async () => {
    let rejectFirst: (error: Error) => void = () => {};
    let rejectSecond: (error: Error) => void = () => {};
    vi.mocked(signInWithPopup)
      .mockReturnValueOnce(new Promise((_resolve, reject) => (rejectFirst = reject)))
      .mockReturnValueOnce(new Promise((_resolve, reject) => (rejectSecond = reject)));
    const user = userEvent.setup();
    renderProbe();

    await user.click(screen.getByRole("button", { name: "sign in" }));
    await user.click(screen.getByRole("button", { name: "sign in" }));
    expect(signInWithPopup).toHaveBeenCalledTimes(2);

    await act(async () => rejectFirst(rejection("auth/cancelled-popup-request")));
    expect(screen.getByTestId("failed")).toHaveTextContent("false");

    await act(async () => rejectSecond(rejection("auth/internal-error")));
    expect(screen.getByTestId("failed")).toHaveTextContent("true");
  });

  it("drops a failure from a pending attempt once another tab has signed in", async () => {
    let rejectPending: (error: Error) => void = () => {};
    vi.mocked(signInWithPopup).mockReturnValueOnce(new Promise((_resolve, reject) => (rejectPending = reject)));
    const user = userEvent.setup();
    renderProbe();
    await user.click(screen.getByRole("button", { name: "sign in" }));

    act(() => authState.callback?.({ uid: "user-a" }));
    await act(async () => rejectPending(rejection("auth/internal-error")));
    act(() => authState.callback?.(null));

    expect(screen.getByTestId("failed")).toHaveTextContent("false");
  });

  it("ignores a failure from an attempt that a newer click has replaced", async () => {
    let rejectFirst: (error: Error) => void = () => {};
    vi.mocked(signInWithPopup)
      .mockReturnValueOnce(new Promise((_resolve, reject) => (rejectFirst = reject)))
      .mockReturnValueOnce(new Promise(() => {}));
    const user = userEvent.setup();
    renderProbe();
    await user.click(screen.getByRole("button", { name: "sign in" }));
    await user.click(screen.getByRole("button", { name: "sign in" }));

    await act(async () => rejectFirst(rejection("auth/internal-error")));

    expect(screen.getByTestId("failed")).toHaveTextContent("false");
  });
});
