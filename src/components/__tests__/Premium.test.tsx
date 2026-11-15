import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Premium from "../Premium";
import useIsPremium, { usePremiumExpiry } from "../../app/use-is-premium";
import { loadPremiumCode } from "../../app/premium-code";
import { useAuth } from "../../contexts/AuthContext";
import en from "../../locales/en_translation.json";
import { CONTACT_EMAIL, KOFI_URL } from "../../app/constants";
import { withQueryClient } from "../../test-utils/with-query-client";

const spies = vi.hoisted(() => ({ signInWithGoogle: vi.fn() }));
const copy = vi.hoisted(() => ({ values: {} as Record<string, string> }));
const contact = vi.hoisted(() => "infoLeonid@protonMail.com");

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en-GB" },
    t: (key: string, options?: { date?: string; email?: string }) =>
      (copy.values[key] ?? key)
        .replace("{{date}}", options?.date ?? "")
        .replace("{{email}}", options?.email ?? ""),
  }),
  Trans: ({ i18nKey }: { i18nKey: string; components?: ReactNode[] }) =>
    (copy.values[i18nKey] ?? i18nKey).replace("<0/>", contact),
}));

vi.mock("../../app/use-is-premium", () => ({
  default: vi.fn(),
  usePremiumExpiry: vi.fn(),
}));

vi.mock("../../app/premium-code", () => ({ loadPremiumCode: vi.fn() }));
vi.mock("../../contexts/AuthContext", () => ({ useAuth: vi.fn() }));

const collect = (value: unknown, prefix: string, out: Record<string, string>): void => {
  if (typeof value === "string") {
    out[prefix] = value;
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      collect(child, prefix ? `${prefix}.${key}` : key, out);
    }
  }
};
collect(en, "", copy.values);

const authValue = (user: { uid: string; email: string | null } | null) => ({
  user,
  loading: false,
  signInWithGoogle: spies.signInWithGoogle,
  signOut: vi.fn(),
}) as ReturnType<typeof useAuth>;

const signedIn = (email: string | null = "player@example.com") =>
  authValue({ uid: "user-1", email });

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

const linkPopup = () => withQueryClient(<Premium variant="link" linkLabel="Remove ads" />);

const heading = () => (vi.mocked(useIsPremium)() ? en.premium.title : en.premium.become);

const openLinkPopup = async () => {
  const user = userEvent.setup();
  const view = render(linkPopup());
  await user.click(screen.getByRole("button", { name: "Remove ads" }));
  return { user, dialog: screen.getByRole("dialog", { name: heading() }), view };
};

const openDefaultPopup = async () => {
  const user = userEvent.setup();
  render(withQueryClient(<Premium />));
  await user.click(screen.getByRole("button", { name: heading() }));
  return { user, dialog: screen.getByRole("dialog", { name: heading() }) };
};

const expandCodeSection = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole("button", { name: en.premium.altCodeToggle }));
};

const emailHintFor = (email: string) => en.premium.emailHint.replace("{{email}}", email);

describe("Premium", () => {
  it("shows the price, the perks and one sign-in step for signed-out visitors", async () => {
    const { user, dialog } = await openLinkPopup();
    expect(within(dialog).getByText(en.premium.price)).toBeInTheDocument();
    expect(within(dialog).getByText(en.premium.perksLead)).toBeInTheDocument();
    expect(within(dialog).queryByRole("table")).not.toBeInTheDocument();
    expect(within(dialog).getByText(en.premium.refund.replace("<0/>", contact))).toBeInTheDocument();
    expect(within(dialog).getByText(en.premium.signInFirst)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: en.premium.signIn }));
    expect(spies.signInWithGoogle).toHaveBeenCalledOnce();
    expect(within(dialog).queryByRole("link", { name: en.premium.cta })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: en.premium.altCodeToggle })).not.toBeInTheDocument();
    expect(loadPremiumCode).not.toHaveBeenCalled();
  });

  it("lists each perk once and nothing every visitor already gets", async () => {
    const { dialog } = await openLinkPopup();
    const items = within(dialog).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual(Object.values(en.premium.perks));
    expect(dialog.textContent).not.toMatch(/Best Deck Finder|[✅🚫]/u);
  });

  it("shows the Discord line right after the perks", async () => {
    const { dialog } = await openLinkPopup();
    const discord = within(dialog).getByText(en.premium.discord);
    const perks = within(dialog).getByRole("list");
    expect(perks.compareDocumentPosition(discord) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(perks.nextElementSibling).toBe(discord);
  });

  it("shows the personal note to a signed-out visitor after the sign-in button", async () => {
    const { dialog } = await openLinkPopup();
    const note = within(dialog).getByText(en.premium.kindNote);
    const signIn = within(dialog).getByRole("button", { name: en.premium.signIn });
    expect(signIn.nextElementSibling).toBe(note);
  });

  it("shows the personal note to a signed-in visitor after the email hint", async () => {
    vi.mocked(useAuth).mockReturnValue(signedIn());
    const { dialog } = await openLinkPopup();
    const note = within(dialog).getByText(en.premium.kindNote);
    const hint = within(dialog).getByText(emailHintFor("player@example.com"));
    expect(hint.nextElementSibling).toBe(note);
  });

  it.each([
    [Date.UTC(2027, 0, 2), "dated"],
    [null, "lifetime"],
  ])("hides the note and the Discord line for a %2$s supporter", async (expiry, state) => {
    vi.mocked(useIsPremium).mockReturnValue(true);
    vi.mocked(usePremiumExpiry).mockReturnValue(expiry);
    vi.mocked(useAuth).mockReturnValue(signedIn());
    const { dialog } = await openDefaultPopup();
    expect(within(dialog).queryByText(en.premium.kindNote), state).not.toBeInTheDocument();
    expect(within(dialog).queryByText(en.premium.discord), state).not.toBeInTheDocument();
  });

  it("keeps the tip rules collapsed after the refund line", async () => {
    const { dialog } = await openLinkPopup();
    const refund = within(dialog).getByText(en.premium.refund.replace("<0/>", contact));
    const details = within(dialog).getByText(en.premium.rulesToggle).closest("details");
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute("open");
    expect(details).toContainElement(within(dialog).getByText(en.premium.priceDetails));
    expect(details!.compareDocumentPosition(refund) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("leads with a Ko-fi call to action and the account email", async () => {
    vi.mocked(useAuth).mockReturnValue(signedIn());
    const { dialog } = await openLinkPopup();
    const cta = within(dialog).getByRole("link", { name: en.premium.cta });
    expect(cta).toHaveAttribute("href", KOFI_URL);
    expect(cta).toHaveAttribute("target", "_blank");
    expect(cta).toHaveAttribute("rel", "noopener noreferrer");
    expect(cta).toHaveStyle("text-decoration: none");
    expect(within(dialog).getByText(emailHintFor("player@example.com"))).toBeInTheDocument();
    expect(within(dialog).getByText(en.premium.price)).toBeInTheDocument();
    expect(loadPremiumCode).not.toHaveBeenCalled();
  });

  it("leaves out the email brackets when the account has no email", async () => {
    vi.mocked(useAuth).mockReturnValue(signedIn(null));
    const { dialog } = await openLinkPopup();
    const hint = within(dialog).getByText(en.premium.emailHintNoEmail);
    expect(hint.textContent).not.toContain("(");
    expect(hint).toHaveTextContent(/code option below/i);
    expect(hint).not.toHaveTextContent(/automatically/i);
    expect(within(dialog).queryByText(/player@example.com/)).not.toBeInTheDocument();
  });

  it("keeps the code section collapsed and unrequested", async () => {
    vi.mocked(useAuth).mockReturnValue(signedIn());
    const { dialog } = await openLinkPopup();
    const toggle = within(dialog).getByRole("button", { name: en.premium.altCodeToggle });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(within(dialog).queryByText(en.premium.altCodeHint)).not.toBeInTheDocument();
    expect(within(dialog).queryByText("PD-ABC234")).not.toBeInTheDocument();
    expect(loadPremiumCode).not.toHaveBeenCalled();
  });

  it("loads the code after expanding and copies it", async () => {
    vi.mocked(useAuth).mockReturnValue(signedIn());
    const { user, dialog } = await openLinkPopup();
    const clipboardWrite = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: clipboardWrite },
    });
    await expandCodeSection(user);
    expect(loadPremiumCode).toHaveBeenCalledWith("user-1");
    expect(await within(dialog).findByText("PD-ABC234")).toBeInTheDocument();
    expect(within(dialog).getByText(en.premium.altCodeHint)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: en.premium.copy }));
    expect(clipboardWrite).toHaveBeenCalledWith("PD-ABC234");
    expect(await within(dialog).findByText(en.premium.copied)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: en.premium.altCodeToggle })).toHaveAttribute("aria-expanded", "true");
  });

  it("shows only the unavailable line when code issuance fails", async () => {
    vi.mocked(useAuth).mockReturnValue(signedIn());
    vi.mocked(loadPremiumCode).mockRejectedValue(new Error("permission-denied"));
    const { user, dialog } = await openLinkPopup();
    await expandCodeSection(user);
    expect(await within(dialog).findByText(en.premium.codeUnavailable)).toBeInTheDocument();
    expect(within(dialog).queryByText(en.premium.altCodeHint)).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/PD-/)).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/permission-denied/)).not.toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: en.premium.cta })).toBeInTheDocument();
  });

  it("shows a contact fallback after code failure when the account has no email", async () => {
    vi.mocked(useAuth).mockReturnValue(signedIn(null));
    vi.mocked(loadPremiumCode).mockRejectedValue(new Error("permission-denied"));
    const { user, dialog } = await openLinkPopup();
    await expandCodeSection(user);
    expect(await within(dialog).findByText(en.premium.codeUnavailableNoEmail)).toBeInTheDocument();
    expect(within(dialog).queryByText(en.premium.codeUnavailable)).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/Google email/i)).not.toBeInTheDocument();
  });

  it("shows the manual-copy line when the clipboard rejects", async () => {
    vi.mocked(useAuth).mockReturnValue(signedIn());
    const { user, dialog } = await openLinkPopup();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error("clipboard failed")) },
    });
    await expandCodeSection(user);
    await within(dialog).findByText("PD-ABC234");
    await user.click(within(dialog).getByRole("button", { name: en.premium.copy }));
    expect(await within(dialog).findByText(en.premium.copyFailed)).toBeInTheDocument();
  });

  it("never renders a previous account's resolved code after an account switch", async () => {
    let resolveFirst!: (value: string) => void;
    const firstCode = new Promise<string>((resolve) => { resolveFirst = resolve; });
    vi.mocked(useAuth).mockReturnValue(authValue({ uid: "account-a", email: "a@example.com" }));
    vi.mocked(loadPremiumCode).mockReturnValue(firstCode);
    const user = userEvent.setup();
    const view = render(linkPopup());
    await user.click(screen.getByRole("button", { name: "Remove ads" }));
    await expandCodeSection(user);
    await waitFor(() => expect(loadPremiumCode).toHaveBeenCalledWith("account-a"));

    vi.mocked(useAuth).mockReturnValue(authValue({ uid: "account-b", email: "b@example.com" }));
    vi.mocked(loadPremiumCode).mockResolvedValue("PD-BBBBBB");
    view.rerender(linkPopup());
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
      const view = render(linkPopup());
      await user.click(screen.getByRole("button", { name: "Remove ads" }));
      await expandCodeSection(user);
      await screen.findByText("PD-AAAAAA");

      const clipboardWrite = vi.fn(() => pendingClipboard);
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: clipboardWrite },
      });
      await user.click(screen.getByRole("button", { name: en.premium.copy }));
      expect(clipboardWrite).toHaveBeenCalledWith("PD-AAAAAA");

      vi.mocked(useAuth).mockReturnValue(authValue({ uid: "account-b", email: "b@example.com" }));
      view.rerender(linkPopup());
      await screen.findByText("PD-BBBBBB");

      await act(async () => {
        if (outcome === "resolve") finishClipboard();
        else failClipboard(new Error("clipboard failed"));
      });
      expect(screen.getByRole("button", { name: en.premium.copy })).toBeInTheDocument();
      expect(screen.queryByText(en.premium.copied)).not.toBeInTheDocument();
      expect(screen.queryByText(en.premium.copyFailed)).not.toBeInTheDocument();
    }
  );

  it("shows an expiry date, Extend on Ko-fi and the account email", async () => {
    const previous = process.env.TZ;
    process.env.TZ = "UTC";
    try {
      vi.mocked(useIsPremium).mockReturnValue(true);
      vi.mocked(usePremiumExpiry).mockReturnValue(Date.UTC(2027, 0, 2));
      vi.mocked(useAuth).mockReturnValue(signedIn());
      const { dialog } = await openDefaultPopup();
      expect(within(dialog).getByText("Your Supporter access ends on 2 January 2027.")).toBeInTheDocument();
      const cta = within(dialog).getByRole("link", { name: en.premium.ctaExtend });
      expect(cta).toHaveAttribute("href", KOFI_URL);
      expect(cta).toHaveAttribute("target", "_blank");
      expect(cta).toHaveAttribute("rel", "noopener noreferrer");
      expect(within(dialog).getByText(emailHintFor("player@example.com"))).toBeInTheDocument();
      expect(within(dialog).getByText(en.premium.price)).toBeInTheDocument();
      const refund = within(dialog).getByText(en.premium.refund.replace("<0/>", contact));
      const rules = within(dialog).getByText(en.premium.rulesToggle);
      expect(rules.compareDocumentPosition(refund) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(within(dialog).queryByRole("listitem")).not.toBeInTheDocument();
    } finally {
      if (previous === undefined) delete process.env.TZ;
      else process.env.TZ = previous;
    }
  });

  it("shows lifetime access without a table, CTA or code lookup", async () => {
    vi.mocked(useIsPremium).mockReturnValue(true);
    vi.mocked(usePremiumExpiry).mockReturnValue(null);
    vi.mocked(useAuth).mockReturnValue(signedIn());
    const { dialog } = await openDefaultPopup();
    expect(within(dialog).getByText(en.premium.lifetime)).toBeInTheDocument();
    expect(within(dialog).queryByRole("table")).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("link", { name: en.premium.cta })).not.toBeInTheDocument();
    expect(within(dialog).queryByText(en.premium.refund.replace("<0/>", contact))).not.toBeInTheDocument();
    expect(within(dialog).queryByText(en.premium.priceDetails)).not.toBeInTheDocument();
    expect(loadPremiumCode).not.toHaveBeenCalled();
  });

  it.each([
    [Date.UTC(2100, 0, 1), "dated"],
    [Date.UTC(2100, 0, 1) + 1, "lifetime"],
  ])("classifies an active expiry at %s as %s", async (expiry, expected) => {
    vi.mocked(useIsPremium).mockReturnValue(true);
    vi.mocked(usePremiumExpiry).mockReturnValue(expiry);
    vi.mocked(useAuth).mockReturnValue(signedIn());
    const { dialog } = await openDefaultPopup();

    if (expected === "dated") {
      expect(within(dialog).getByRole("link", { name: en.premium.ctaExtend })).toBeInTheDocument();
      expect(within(dialog).queryByText(en.premium.lifetime)).not.toBeInTheDocument();
    } else {
      expect(within(dialog).getByText(en.premium.lifetime)).toBeInTheDocument();
      expect(
        within(dialog).queryByRole("link", { name: en.premium.ctaExtend })
      ).not.toBeInTheDocument();
    }
  });

  it("keeps the refund contact in every non-lifetime state", async () => {
    const { dialog } = await openLinkPopup();
    expect(within(dialog).getByText(en.premium.refund.replace("<0/>", CONTACT_EMAIL))).toBeInTheDocument();
  });

  it("closes the popup on Escape and restores focus to the trigger", async () => {
    const { user } = await openLinkPopup();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove ads" })).toHaveFocus();
  });

  it("swaps to the Supporter state when the entitlement flips", async () => {
    const previous = process.env.TZ;
    process.env.TZ = "UTC";
    try {
      vi.mocked(useAuth).mockReturnValue(signedIn());
      const user = userEvent.setup();
      const view = render(linkPopup());
      await user.click(screen.getByRole("button", { name: "Remove ads" }));
      await user.click(screen.getByRole("link", { name: en.premium.cta }));
      expect(screen.getByText(en.premium.waiting)).toBeInTheDocument();
      vi.mocked(useIsPremium).mockReturnValue(true);
      vi.mocked(usePremiumExpiry).mockReturnValue(Date.UTC(2027, 0, 2));
      view.rerender(linkPopup());
      expect(screen.queryByText(en.premium.waiting)).not.toBeInTheDocument();
      expect(screen.getByText("Your Supporter access ends on 2 January 2027.")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: en.premium.ctaExtend })).toBeInTheDocument();
    } finally {
      if (previous === undefined) delete process.env.TZ;
      else process.env.TZ = previous;
    }
  });
});
