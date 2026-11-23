import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import FeedbackPage from "../FeedbackPage";

const auth = vi.hoisted(() => ({
  user: null as null | { uid: string; email: string | null; displayName: string | null },
  loading: false,
  signInFailed: false,
  signInWithGoogle: vi.fn(),
}));

const submitFeedback = vi.hoisted(() => vi.fn());
const readFeedbackThrottle = vi.hoisted(() => vi.fn());

vi.mock("../../../app/use-auth", () => ({
  useAuth: () => auth,
}));

vi.mock("../../../app/feedback-api", () => ({
  submitFeedback,
  readFeedbackThrottle,
}));

vi.mock("../../../ads/ContentReadyContext", () => ({
  useMarkContentReady: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { minutes?: number }) => (key === "feedback.rateLimitedFor" ? `${key} ${options?.minutes ?? ""}` : key),
  }),
  Trans: ({ i18nKey }: { i18nKey: string }) => i18nKey,
}));

const renderPage = (search = "") =>
  render(
    <MemoryRouter initialEntries={[{ pathname: "/feedback", search, state: { from: "/tier-list" } }]}>
      <FeedbackPage />
    </MemoryRouter>
  );

const typeMessage = (text: string) =>
  fireEvent.change(screen.getByLabelText("feedback.messageLabel"), {
    target: { value: text },
  });

const submit = () => fireEvent.click(screen.getByRole("button", { name: "feedback.submit" }));

const agree = () => fireEvent.click(screen.getByRole("checkbox", { name: "feedback.consent" }));

beforeEach(() => {
  auth.user = { uid: "user-1", email: "ash@example.com", displayName: "Ash" };
  auth.loading = false;
  auth.signInFailed = false;
  auth.signInWithGoogle.mockReset();
  submitFeedback.mockReset();
  submitFeedback.mockResolvedValue(undefined);
  readFeedbackThrottle.mockReset();
  readFeedbackThrottle.mockResolvedValue(null);
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

  it("shows a notice beside the sign-in button after a failed sign-in", () => {
    auth.user = null;
    auth.signInFailed = true;
    renderPage();

    expect(screen.getByText("userAccount.signInFailed")).toBeInTheDocument();
  });

  it("shows no sign-in notice before a failure", () => {
    auth.user = null;
    renderPage();

    expect(screen.queryByText("userAccount.signInFailed")).not.toBeInTheDocument();
  });

  it("blocks a message shorter than the minimum and explains why", () => {
    renderPage();
    typeMessage("too short");
    agree();
    submit();

    expect(screen.getByRole("alert")).toHaveTextContent("feedback.messageTooShort");
    expect(screen.getByLabelText("feedback.messageLabel")).toHaveAttribute("aria-invalid", "true");
    expect(submitFeedback).not.toHaveBeenCalled();
  });

  it("sends the message with the account email and records the agreement", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("radio", { name: "feedback.categories.bug" }));
    typeMessage("  The matchup matrix is empty on Safari.  ");
    agree();
    submit();

    await waitFor(() => expect(submitFeedback).toHaveBeenCalledTimes(1));
    expect(submitFeedback).toHaveBeenCalledWith({
      uid: "user-1",
      email: "ash@example.com",
      category: "bug",
      message: "The matchup matrix is empty on Safari.",
      contactOk: true,
      page: "/tier-list",
    });
    expect(await screen.findByRole("heading", { name: "feedback.successTitle" })).toBeInTheDocument();
  });

  it("shows the time left and keeps the message when the throttle is recent", async () => {
    readFeedbackThrottle.mockResolvedValueOnce(Date.now() - 10 * 60_000);
    renderPage();
    typeMessage("  The matchup matrix is empty on Safari.  ");
    agree();
    await submit();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("feedback.rateLimitedFor"));
    expect(screen.getByRole("alert")).toHaveTextContent("50");
    expect(screen.getByLabelText("feedback.messageLabel")).toHaveValue("  The matchup matrix is empty on Safari.  ");
    expect(submitFeedback).not.toHaveBeenCalled();
  });

  it("shows a general failure for a refusal that is not a rate limit", async () => {
    submitFeedback.mockRejectedValueOnce(Object.assign(new Error("denied"), { code: "permission-denied" }));
    renderPage();
    typeMessage("The matchup matrix is empty on Safari.");
    agree();
    await submit();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("feedback.error"));
    expect(screen.queryByText("feedback.rateLimitedFor")).not.toBeInTheDocument();
    expect(screen.getByLabelText("feedback.messageLabel")).toHaveValue("The matchup matrix is empty on Safari.");
  });

  it("lists the categories with Something else last", () => {
    renderPage();

    const radios = screen.getAllByRole("radio").map((radio) => (radio as HTMLInputElement).value);
    expect(radios).toEqual([
      "idea",
      "bug",
      "data",
      "stripe",
      "payment",
      "partnership",
      "translation",
      "other",
    ]);
  });

  it.each(["stripe", "payment", "partnership", "translation"])("sends a message filed under %s", async (category) => {
    renderPage();
    fireEvent.click(screen.getByRole("radio", { name: `feedback.categories.${category}` }));
    typeMessage("I was charged after the move to Ko-fi.");
    agree();
    submit();

    await waitFor(() => expect(submitFeedback).toHaveBeenCalledTimes(1));
    expect(submitFeedback.mock.calls[0][0]).toMatchObject({ category });
  });

  it("preselects the category named in the link", () => {
    renderPage("?category=payment");

    expect(screen.getByRole("radio", { name: "feedback.categories.payment" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "feedback.categories.idea" })).not.toBeChecked();
  });

  it.each(["?category=spam", "?category=", ""])("falls back to an idea for the link query %j", (search) => {
    renderPage(search);

    expect(screen.getByRole("radio", { name: "feedback.categories.idea" })).toBeChecked();
  });

  it("offers no optional reply box any more", () => {
    renderPage();

    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    expect(screen.getByRole("checkbox", { name: "feedback.consent" })).not.toBeChecked();
  });

  it("blocks the submission until the agreement box is ticked", async () => {
    renderPage();
    typeMessage("The tier list did not load this morning.");
    submit();

    expect(screen.getByRole("alert")).toHaveTextContent("feedback.consentRequired");
    expect(screen.getByRole("checkbox", { name: "feedback.consent" })).toHaveAttribute(
      "aria-invalid",
      "true"
    );
    expect(submitFeedback).not.toHaveBeenCalled();

    agree();
    expect(screen.queryByText("feedback.consentRequired")).not.toBeInTheDocument();
    submit();

    await waitFor(() => expect(submitFeedback).toHaveBeenCalledTimes(1));
  });

  it("reports both problems when the message is short and the box is unticked", () => {
    renderPage();
    typeMessage("too short");
    submit();

    const alerts = screen.getAllByRole("alert").map((alert) => alert.textContent);
    expect(alerts).toEqual(
      expect.arrayContaining(["feedback.messageTooShort", "feedback.consentRequired"])
    );
    expect(submitFeedback).not.toHaveBeenCalled();
  });

  it("does not send when the account has no email address", async () => {
    auth.user = { uid: "user-1", email: null, displayName: "Ash" };
    renderPage();
    typeMessage("The tier list did not load this morning.");
    agree();
    submit();

    expect(await screen.findByRole("alert")).toHaveTextContent("feedback.error");
    expect(submitFeedback).not.toHaveBeenCalled();
  });

  it("drops submissions that fill the hidden honeypot field", async () => {
    renderPage();
    typeMessage("Buy cheap followers at example dot com today.");
    fireEvent.change(screen.getByLabelText("Website"), {
      target: { value: "https://spam.example" },
    });
    agree();
    submit();

    expect(await screen.findByRole("heading", { name: "feedback.successTitle" })).toBeInTheDocument();
    expect(submitFeedback).not.toHaveBeenCalled();
  });

  it("shows an error and keeps the message when sending fails", async () => {
    submitFeedback.mockRejectedValueOnce(new Error("permission-denied"));
    renderPage();
    typeMessage("The tier list did not load this morning.");
    agree();
    submit();

    expect(await screen.findByRole("alert")).toHaveTextContent("feedback.error");
    expect(screen.getByLabelText("feedback.messageLabel")).toHaveValue(
      "The tier list did not load this morning."
    );
  });

  it("shows a general failure when Firestore refuses the message for another reason", async () => {
    submitFeedback.mockRejectedValueOnce(Object.assign(new Error("denied"), { code: "permission-denied" }));
    renderPage();
    typeMessage("The tier list did not load this morning.");
    agree();
    submit();

    expect(await screen.findByRole("alert")).toHaveTextContent("feedback.error");
    expect(screen.getByLabelText("feedback.messageLabel")).toHaveValue(
      "The tier list did not load this morning."
    );
  });
});
