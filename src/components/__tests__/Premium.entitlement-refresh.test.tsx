import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createInstance } from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Premium from "../Premium";
import en from "../../locales/en_translation.json";
import { useAuth } from "../../contexts/AuthContext";

const firestore = vi.hoisted(() => ({
  getDoc: vi.fn(),
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join("/") })),
  getFirestore: vi.fn(() => ({ kind: "db" })),
}));

vi.mock("firebase/firestore", () => firestore);
vi.mock("../../config/firebase", () => ({ __esModule: true, default: { name: "app" } }));
vi.mock("../../contexts/AuthContext", () => ({ useAuth: vi.fn() }));
vi.mock("../../app/premium-code", () => ({
  loadPremiumCode: vi.fn().mockResolvedValue("PD-ABC234"),
}));

const i18n = createInstance();
await i18n.use(initReactI18next).init({
  lng: "en-GB",
  fallbackLng: "en",
  resources: { en: { translation: en } },
  interpolation: { escapeValue: false },
});

const DAY = 24 * 60 * 60 * 1000;
const absent = {
  exists: () => false,
  data: () => undefined,
};
const granted = (expiresAt = Date.now() + DAY) => ({
  exists: () => true,
  data: () => ({ premium: true, expiresAt: { toMillis: () => expiresAt } }),
});

let client: QueryClient;

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.mocked(useAuth).mockReturnValue({
    user: { uid: "user-1", email: "player@example.com" },
    loading: false,
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
  } as unknown as ReturnType<typeof useAuth>);
  firestore.getDoc
    .mockReset()
    .mockResolvedValueOnce(absent)
    .mockResolvedValueOnce(granted())
    .mockResolvedValue(absent);
});

afterEach(() => {
  cleanup();
  client.clear();
  vi.restoreAllMocks();
});

const renderPremium = () =>
  render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={client}>
        <Premium variant="link" linkLabel="Remove ads" />
      </QueryClientProvider>
    </I18nextProvider>
  );

const openAndTip = async () => {
  const user = userEvent.setup();
  renderPremium();
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Remove ads" })).toBeInTheDocument()
  );
  await user.click(screen.getByRole("button", { name: "Remove ads" }));
  const dialog = screen.getByRole("dialog", { name: en.premium.title });
  await waitFor(() =>
    expect(within(dialog).getByRole("link", { name: en.premium.cta })).toBeInTheDocument()
  );
  await user.click(within(dialog).getByRole("link", { name: en.premium.cta }));
  expect(within(dialog).getByText(en.premium.waiting)).toBeInTheDocument();
  return { user, dialog };
};

const expectExpiryState = async (dialog: HTMLElement) => {
  await waitFor(() =>
    expect(within(dialog).getByText(/Your Premium access ends on/)).toBeInTheDocument()
  );
  expect(within(dialog).getByRole("link", { name: en.premium.ctaExtend })).toBeInTheDocument();
  expect(firestore.getDoc).toHaveBeenCalledTimes(2);
};

describe("Premium entitlement refresh", () => {
  it("shows the expiry state after window focus once the call to action was clicked", async () => {
    const { dialog } = await openAndTip();
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    await expectExpiryState(dialog);
  });

  it("shows the expiry state after Check again", async () => {
    const { user, dialog } = await openAndTip();
    await user.click(within(dialog).getByRole("button", { name: en.premium.checkAgain }));
    await expectExpiryState(dialog);
  });

  it("consumes a completed attempt so an expired grant does not restore waiting", async () => {
    const { dialog } = await openAndTip();
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    await expectExpiryState(dialog);

    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + 2 * DAY);
    await act(async () => {
      await client.refetchQueries({ queryKey: ["entitlement", "user-1"] });
    });

    await waitFor(() =>
      expect(within(dialog).getByRole("link", { name: en.premium.cta })).toBeInTheDocument()
    );
    expect(within(dialog).queryByText(en.premium.waiting)).not.toBeInTheDocument();
    expect(firestore.getDoc).toHaveBeenCalledTimes(3);
  });

  it("consumes a pending attempt completed by a lifetime grant even if it is later revoked", async () => {
    firestore.getDoc
      .mockReset()
      .mockResolvedValueOnce(absent)
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ premium: true }),
      })
      .mockResolvedValue(absent);
    const { dialog } = await openAndTip();
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });

    await waitFor(() => expect(within(dialog).getByText(en.premium.lifetime)).toBeInTheDocument());
    expect(within(dialog).queryByText(en.premium.waiting)).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("link", { name: en.premium.cta })).not.toBeInTheDocument();
    expect(firestore.getDoc).toHaveBeenCalledTimes(2);

    await act(async () => {
      await client.refetchQueries({ queryKey: ["entitlement", "user-1"] });
    });
    await waitFor(() =>
      expect(within(dialog).getByRole("link", { name: en.premium.cta })).toBeInTheDocument()
    );
    expect(within(dialog).queryByText(en.premium.waiting)).not.toBeInTheDocument();
    expect(firestore.getDoc).toHaveBeenCalledTimes(3);
  });

  it("clears the pending attempt on close and does not refresh on focus while closed", async () => {
    const { user } = await openAndTip();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(firestore.getDoc).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Remove ads" }));
    const reopened = screen.getByRole("dialog", { name: en.premium.title });
    expect(within(reopened).queryByText(en.premium.waiting)).not.toBeInTheDocument();
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(firestore.getDoc).toHaveBeenCalledTimes(1);
    expect(within(reopened).queryByText(/Your Premium access ends on/)).not.toBeInTheDocument();
  });

  it("does not refresh on window focus before the call to action is clicked", async () => {
    const user = userEvent.setup();
    renderPremium();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Remove ads" })).toBeInTheDocument()
    );
    await user.click(screen.getByRole("button", { name: "Remove ads" }));
    const dialog = screen.getByRole("dialog", { name: en.premium.title });
    await waitFor(() =>
      expect(within(dialog).getByRole("link", { name: en.premium.cta })).toBeInTheDocument()
    );
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(firestore.getDoc).toHaveBeenCalledTimes(1);
    expect(within(dialog).queryByText(en.premium.waiting)).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/Your Premium access ends on/)).not.toBeInTheDocument();
  });
});
