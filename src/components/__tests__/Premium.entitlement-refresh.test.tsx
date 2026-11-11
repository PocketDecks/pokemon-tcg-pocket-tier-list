import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
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

const granted = {
  exists: () => true,
  data: () => ({ premium: true, expiresAt: { toMillis: () => Date.UTC(2027, 0, 2) } }),
};

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
    .mockResolvedValueOnce({ exists: () => false })
    .mockResolvedValueOnce(granted);
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
