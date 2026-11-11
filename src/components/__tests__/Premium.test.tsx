import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Premium from "../Premium";
import useIsPremium, { usePremiumExpiry } from "../../app/use-is-premium";
import { loadPremiumCode } from "../../app/premium-code";
import { useAuth } from "../../contexts/AuthContext";

const spies = vi.hoisted(() => ({ signInWithGoogle: vi.fn() }));
const copy = vi.hoisted(
  (): Record<string, string> => ({
    "a11y.closePopup": "Close panel",
    "premium.title": "Premium",
    "premium.benefits": "No ads, detailed matchups and more deck data.",
    "premium.price": "Each whole GBP 1 buys one calendar month. Later tips extend your expiry.",
    "premium.signInFirst": "Sign in with Google first so we can match your tip to your account.",
    "premium.signIn": "Sign in with Google",
    "premium.tipPrompt": "Paste this code into your Ko-fi message. Tipping from your Google account email also works.",
    "premium.codeLoading": "Preparing your account code…",
    "premium.copy": "Copy code",
    "premium.copied": "Copied",
    "premium.codeError": "Use the email address on your Google account in your Ko-fi message.",
    "premium.expires": "Your Premium access ends on {{date}}.",
    "premium.lifetime": "Your Premium access does not expire.",
    "premium.tip": "Support on Ko-fi",
  })
);

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en-GB" },
    t: (key: string, options?: { date?: string }) =>
      (copy[key] ?? key).replace("{{date}}", options?.date ?? ""),
  }),
  Trans: ({ i18nKey }: { i18nKey: string; components?: ReactNode[] }) => copy[i18nKey] ?? i18nKey,
}));

vi.mock("../../app/use-is-premium", () => ({
  default: vi.fn(),
  usePremiumExpiry: vi.fn(),
}));

vi.mock("../../app/premium-code", () => ({ loadPremiumCode: vi.fn() }));
vi.mock("../../contexts/AuthContext", () => ({ useAuth: vi.fn() }));

const authValue = (user: { uid: string; email: string } | null) => ({
  user,
  loading: false,
  signInWithGoogle: spies.signInWithGoogle,
  signOut: vi.fn(),
}) as ReturnType<typeof useAuth>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useIsPremium).mockReturnValue(false);
  vi.mocked(usePremiumExpiry).mockReturnValue(null);
  vi.mocked(useAuth).mockReturnValue(authValue(null));
  vi.mocked(loadPremiumCode).mockResolvedValue("PD-ABC234");
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

const openLinkPopup = async () => {
  const user = userEvent.setup();
  render(<Premium variant="link" linkLabel="Remove ads" />);
  await user.click(screen.getByRole("button", { name: "Remove ads" }));
  return { user, dialog: screen.getByRole("dialog", { name: "Premium" }) };
};

describe("Premium", () => {
  it("shows the sign-in prompt for signed-out visitors", async () => {
    const { user, dialog } = await openLinkPopup();
    expect(within(dialog).getByText(copy["premium.benefits"])).toBeInTheDocument();
    expect(within(dialog).getByText(copy["premium.price"])).toBeInTheDocument();
    expect(within(dialog).getByText(copy["premium.signInFirst"])).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: copy["premium.signIn"] }));
    expect(spies.signInWithGoogle).toHaveBeenCalledOnce();
    expect(loadPremiumCode).not.toHaveBeenCalled();
  });

  it("loads a signed-in user's code only after opening and links to Ko-fi securely", async () => {
    vi.mocked(useAuth).mockReturnValue(authValue({ uid: "user-1", email: "player@example.com" }));
    const user = userEvent.setup();
    render(<Premium variant="link" linkLabel="Remove ads" />);
    expect(loadPremiumCode).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Remove ads" }));
    const dialog = screen.getByRole("dialog", { name: "Premium" });

    await waitFor(() => expect(loadPremiumCode).toHaveBeenCalledWith("user-1"));
    const link = within(dialog).getByRole("link", { name: copy["premium.tip"] });
    expect(link).toHaveAttribute("href", "https://ko-fi.com/dalin");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(within(dialog).getByText("PD-ABC234")).toBeInTheDocument();
    const clipboardWrite = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: clipboardWrite },
    });
    await user.click(within(dialog).getByRole("button", { name: copy["premium.copy"] }));
    expect(clipboardWrite).toHaveBeenCalledWith("PD-ABC234");
    expect(await within(dialog).findByText(copy["premium.copied"])).toBeInTheDocument();
  });

  it("shows account-email fallback if code issuance fails", async () => {
    vi.mocked(useAuth).mockReturnValue(authValue({ uid: "user-1", email: "player@example.com" }));
    vi.mocked(loadPremiumCode).mockRejectedValue(new Error("permission-denied"));
    const { dialog } = await openLinkPopup();
    expect(await within(dialog).findByText(copy["premium.codeError"])).toBeInTheDocument();
    expect(within(dialog).queryByText(/permission-denied/)).not.toBeInTheDocument();
  });

  it("shows an expiry date and a secure Ko-fi link to extend", async () => {
    vi.mocked(useIsPremium).mockReturnValue(true);
    vi.mocked(usePremiumExpiry).mockReturnValue(Date.UTC(2027, 0, 2));
    vi.mocked(useAuth).mockReturnValue(authValue({ uid: "user-1", email: "player@example.com" }));
    render(<Premium />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Premium" }));
    const dialog = screen.getByRole("dialog", { name: "Premium" });
    expect(within(dialog).getByText("Your Premium access ends on 2 January 2027.")).toBeInTheDocument();
    const link = within(dialog).getByRole("link", { name: copy["premium.tip"] });
    expect(link).toHaveAttribute("href", "https://ko-fi.com/dalin");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("shows lifetime access without an expiry date", async () => {
    vi.mocked(useIsPremium).mockReturnValue(true);
    vi.mocked(usePremiumExpiry).mockReturnValue(null);
    vi.mocked(useAuth).mockReturnValue(authValue({ uid: "user-1", email: "player@example.com" }));
    render(<Premium />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Premium" }));
    expect(screen.getByText(copy["premium.lifetime"])).toBeInTheDocument();
    expect(loadPremiumCode).not.toHaveBeenCalled();
  });

  it("never renders a previous account's resolved code after an account switch", async () => {
    let resolveFirst!: (value: string) => void;
    const firstCode = new Promise<string>((resolve) => { resolveFirst = resolve; });
    vi.mocked(useAuth).mockReturnValue(authValue({ uid: "account-a", email: "a@example.com" }));
    vi.mocked(loadPremiumCode).mockReturnValue(firstCode);
    const { rerender } = render(<Premium variant="link" linkLabel="Remove ads" />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Remove ads" }));
    await waitFor(() => expect(loadPremiumCode).toHaveBeenCalledWith("account-a"));

    vi.mocked(useAuth).mockReturnValue(authValue({ uid: "account-b", email: "b@example.com" }));
    vi.mocked(loadPremiumCode).mockResolvedValue("PD-BBBBBB");
    rerender(<Premium variant="link" linkLabel="Remove ads" />);
    expect(screen.queryByText("PD-AAAAAA")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("PD-BBBBBB")).toBeInTheDocument());
    await act(async () => { resolveFirst("PD-AAAAAA"); });
    expect(screen.queryByText("PD-AAAAAA")).not.toBeInTheDocument();
  });

  it.each(["resolve", "reject"] as const)(
    "ignores a late clipboard %s after the account changes",
    async (outcome) => {
      let finishClipboard!: () => void;
      let failClipboard!: (error: Error) => void;
      const pendingClipboard = new Promise<void>((resolve, reject) => {
        finishClipboard = resolve;
        failClipboard = reject;
      });
      vi.mocked(useAuth).mockReturnValue(authValue({ uid: "account-a", email: "a@example.com" }));
      vi.mocked(loadPremiumCode).mockImplementation((uid) =>
        Promise.resolve(uid === "account-a" ? "PD-AAAAAA" : "PD-BBBBBB")
      );
      const user = userEvent.setup();
      const view = render(<Premium variant="link" linkLabel="Remove ads" />);
      await user.click(screen.getByRole("button", { name: "Remove ads" }));
      await screen.findByText("PD-AAAAAA");

      const clipboardWrite = vi.fn(() => pendingClipboard);
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: clipboardWrite },
      });
      await user.click(screen.getByRole("button", { name: copy["premium.copy"] }));
      expect(clipboardWrite).toHaveBeenCalledWith("PD-AAAAAA");

      vi.mocked(useAuth).mockReturnValue(authValue({ uid: "account-b", email: "b@example.com" }));
      view.rerender(<Premium variant="link" linkLabel="Remove ads" />);
      await screen.findByText("PD-BBBBBB");

      await act(async () => {
        if (outcome === "resolve") finishClipboard();
        else failClipboard(new Error("clipboard failed"));
      });
      expect(screen.getByRole("button", { name: copy["premium.copy"] })).toBeInTheDocument();
      expect(screen.queryByText(copy["premium.copied"])).not.toBeInTheDocument();
      expect(screen.queryByText(copy["premium.codeError"])).not.toBeInTheDocument();
    }
  );
});
