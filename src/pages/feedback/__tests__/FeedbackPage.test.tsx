import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import FeedbackPage from "../FeedbackPage";

const auth = vi.hoisted(() => ({
  user: null as null | { uid: string; email: string | null; displayName: string | null },
  loading: false,
  signInWithGoogle: vi.fn(),
}));

const submitFeedback = vi.hoisted(() => vi.fn());

vi.mock("../../../app/use-auth", () => ({
  useAuth: () => auth,
}));

vi.mock("../../../app/feedback-api", () => ({
  submitFeedback,
}));

vi.mock("../../../ads/ContentReadyContext", () => ({
  useMarkContentReady: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={[{ pathname: "/feedback", state: { from: "/tier-list" } }]}>
      <FeedbackPage />
    </MemoryRouter>
  );

const typeMessage = (text: string) =>
  fireEvent.change(screen.getByLabelText("feedback.messageLabel"), {
    target: { value: text },
  });

const submit = () => fireEvent.click(screen.getByRole("button", { name: "feedback.submit" }));

beforeEach(() => {
  auth.user = { uid: "user-1", email: "ash@example.com", displayName: "Ash" };
  auth.loading = false;
  auth.signInWithGoogle.mockReset();
  submitFeedback.mockReset();
  submitFeedback.mockResolvedValue(undefined);
});

describe("FeedbackPage", () => {
  it("asks signed-out visitors to sign in and hides the form", () => {
    auth.user = null;
    renderPage();

    expect(screen.getByRole("heading", { name: "feedback.signInTitle" })).toBeInTheDocument();
    expect(screen.queryByLabelText("feedback.messageLabel")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "header.signIn" }));
    expect(auth.signInWithGoogle).toHaveBeenCalledTimes(1);
  });

  it("blocks a message shorter than the minimum and explains why", () => {
    renderPage();
    typeMessage("too short");
    submit();

    expect(screen.getByRole("alert")).toHaveTextContent("feedback.messageTooShort");
    expect(screen.getByLabelText("feedback.messageLabel")).toHaveAttribute("aria-invalid", "true");
    expect(submitFeedback).not.toHaveBeenCalled();
  });

  it("sends the message without an email unless the visitor asks for a reply", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("radio", { name: "feedback.categories.bug" }));
    typeMessage("  The matchup matrix is empty on Safari.  ");
    submit();

    await waitFor(() => expect(submitFeedback).toHaveBeenCalledTimes(1));
    expect(submitFeedback).toHaveBeenCalledWith({
      uid: "user-1",
      email: null,
      category: "bug",
      message: "The matchup matrix is empty on Safari.",
      contactOk: false,
      page: "/tier-list",
    });
    expect(await screen.findByRole("heading", { name: "feedback.successTitle" })).toBeInTheDocument();
  });

  it("includes the account email when the visitor ticks the reply box", async () => {
    renderPage();
    typeMessage("Please add a dark mode toggle for the matrix.");
    fireEvent.click(screen.getByRole("checkbox", { name: "feedback.contactLabel" }));
    submit();

    await waitFor(() => expect(submitFeedback).toHaveBeenCalledTimes(1));
    expect(submitFeedback.mock.calls[0][0]).toMatchObject({
      email: "ash@example.com",
      contactOk: true,
    });
  });

  it("drops submissions that fill the hidden honeypot field", async () => {
    renderPage();
    typeMessage("Buy cheap followers at example dot com today.");
    fireEvent.change(screen.getByLabelText("Website"), {
      target: { value: "https://spam.example" },
    });
    submit();

    expect(await screen.findByRole("heading", { name: "feedback.successTitle" })).toBeInTheDocument();
    expect(submitFeedback).not.toHaveBeenCalled();
  });

  it("shows an error and keeps the message when sending fails", async () => {
    submitFeedback.mockRejectedValueOnce(new Error("permission-denied"));
    renderPage();
    typeMessage("The tier list did not load this morning.");
    submit();

    expect(await screen.findByRole("alert")).toHaveTextContent("feedback.error");
    expect(screen.getByLabelText("feedback.messageLabel")).toHaveValue(
      "The tier list did not load this morning."
    );
  });

  it("explains the hourly limit when Firestore refuses the message", async () => {
    submitFeedback.mockRejectedValueOnce(Object.assign(new Error("denied"), { code: "permission-denied" }));
    renderPage();
    typeMessage("The tier list did not load this morning.");
    submit();

    expect(await screen.findByRole("alert")).toHaveTextContent("feedback.rateLimited");
    expect(screen.getByLabelText("feedback.messageLabel")).toHaveValue(
      "The tier list did not load this morning."
    );
  });
});
