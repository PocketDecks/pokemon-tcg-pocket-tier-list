import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { clearConsentRuntimeCache } from "c15t";
import { baseTranslations } from "@c15t/translations/all";
import { createInstance, type i18n as I18nInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import type { ReactNode } from "react";

vi.mock("@c15t/scripts/google-tag", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@c15t/scripts/google-tag")>();
  return {
    ...actual,
    gtag: (options: Parameters<typeof actual.gtag>[0]) => ({
      ...actual.gtag(options),
      id: `gtag-${crypto.randomUUID()}`,
    }),
  };
});

const clearCookies = () => {
  for (const entry of document.cookie.split(";")) {
    const name = entry.split("=")[0]?.trim();
    if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  }
};

const createLanguageInstance = async (language: string): Promise<I18nInstance> => {
  const instance = createInstance();
  await instance.init({
    lng: language,
    fallbackLng: "en",
    resources: {},
    interpolation: { escapeValue: false },
  });
  return instance;
};

const renderWithLanguage = async (language: string, children: ReactNode) => {
  const instance = await createLanguageInstance(language);
  const ConsentProvider = (await import("../ConsentProvider")).default;
  render(
    <I18nextProvider i18n={instance}>
      <ConsentProvider>{children}</ConsentProvider>
    </I18nextProvider>
  );
  return instance;
};

const openDialog = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(await screen.findByTestId("consent-banner-customize-button"));
  return screen.findByTestId("consent-dialog-card");
};

describe("ConsentProvider presentation", () => {
  beforeEach(() => {
    clearConsentRuntimeCache();
    document.documentElement.dataset.appVisible = "true";
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    });
    clearCookies();
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    vi.resetModules();
    delete document.documentElement.dataset.appVisible;
    clearCookies();
    localStorage.clear();
  });

  it("links the privacy policy from the banner and the dialog", async () => {
    const user = userEvent.setup();
    await renderWithLanguage("en", null);

    const banner = await screen.findByTestId("consent-banner-root");
    const bannerLink = banner.querySelector(`a[href="/privacy/"]`);
    expect(bannerLink).not.toBeNull();
    expect(bannerLink).toHaveTextContent(baseTranslations.en.legalLinks.privacyPolicy);

    const dialog = await openDialog(user);
    const dialogLink = dialog.querySelector(`a[href="/privacy/"]`);
    expect(dialogLink).not.toBeNull();
    expect(dialogLink).toHaveTextContent(baseTranslations.en.legalLinks.privacyPolicy);
  });

  it("shows no c15t branding in the dialog or the banner", async () => {
    vi.stubEnv("DEV", false);
    const user = userEvent.setup();
    await renderWithLanguage("en", null);

    await screen.findByTestId("consent-banner-root");
    expect(screen.queryByTestId("consent-banner-branding")).toBeNull();
    expect(screen.queryByTestId("consent-widget-branding")).toBeNull();
    expect(screen.queryByTestId("consent-dialog-branding")).toBeNull();

    await openDialog(user);
    expect(screen.queryByTestId("consent-dialog-branding")).toBeNull();
    expect(screen.queryByTestId("consent-widget-branding")).toBeNull();
  });

  it("uses British English in the English banner", async () => {
    await renderWithLanguage("en", null);

    const banner = await screen.findByTestId("consent-banner-root");
    expect(banner.querySelector('[data-testid="consent-banner-customize-button"]')).toHaveTextContent(
      "Customise"
    );
    expect(banner).toHaveTextContent("analyse site traffic");
    expect(banner).toHaveTextContent("personalised content");
  });

  it.each([
    ["de", "de"],
    ["fr", "fr"],
    ["zh-CN", "zh"],
    ["zh-TW", "en"],
    ["ja", "en"],
  ])("shows c15t copy for app language %s as %s", async (appLanguage, consentLanguage) => {
    await renderWithLanguage(appLanguage, null);

    await waitFor(() => {
      expect(screen.getByText(baseTranslations[consentLanguage as "en"].cookieBanner.title)).toBeInTheDocument();
    });
  });

  it("follows the app language when it changes", async () => {
    const instance = await renderWithLanguage("de", null);

    await screen.findByText(baseTranslations.de.cookieBanner.title);

    await act(async () => {
      await instance.changeLanguage("fr");
    });

    await screen.findByText(baseTranslations.fr.cookieBanner.title);
  });

  it("opens the dialog from a footer link in a region with no banner", async () => {
    document.cookie = "pd_geo=JP-13";
    const user = userEvent.setup();
    const ConsentProvider = (await import("../ConsentProvider")).default;
    const { ConsentDialogLink } = await import("@c15t/react");
    render(
      <ConsentProvider>
        <ConsentDialogLink>Privacy settings</ConsentDialogLink>
      </ConsentProvider>
    );

    await user.click(await screen.findByRole("button", { name: "Privacy settings" }));

    expect(await screen.findByTestId("consent-dialog-card")).toBeInTheDocument();
    expect(screen.queryByTestId("consent-banner-root")).toBeNull();
  });
});
