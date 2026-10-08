import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { useConsentManager } from "@c15t/react";
import type { ClassNameStyle } from "@c15t/ui/theme";
import { clearConsentRuntimeCache } from "c15t";
import type { ReactNode } from "react";
import { ThemeProvider, useTheme } from "../../contexts/ThemeContext";
import { themeTokens } from "../../styles/theme-tokens";
import { consentTheme } from "../consent-theme";
import ConsentProvider from "../ConsentProvider";

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

type ConsentStore = ReturnType<typeof useConsentManager>;
type DataLayerEntry = ArrayLike<unknown>;

interface Row {
  name: string;
  cookie?: string;
  timeZone: string | null;
  policyId: string;
  banner: boolean;
  analytics: "granted" | "denied";
  ads: "granted" | "denied";
}

const rows: Row[] = [
  { name: "Europe/Berlin", timeZone: "Europe/Berlin", policyId: "europe_opt_in", banner: true, analytics: "denied", ads: "denied" },
  { name: "Europe/London", timeZone: "Europe/London", policyId: "europe_opt_in", banner: true, analytics: "denied", ads: "denied" },
  { name: "Europe/Zurich", timeZone: "Europe/Zurich", policyId: "europe_opt_in", banner: true, analytics: "denied", ads: "denied" },
  { name: "Atlantic/Canary", timeZone: "Atlantic/Canary", policyId: "europe_opt_in", banner: true, analytics: "denied", ads: "denied" },
  { name: "Indian/Reunion", timeZone: "Indian/Reunion", policyId: "europe_opt_in", banner: true, analytics: "denied", ads: "denied" },
  { name: "Europe/Jersey", timeZone: "Europe/Jersey", policyId: "europe_opt_in", banner: true, analytics: "denied", ads: "denied" },
  { name: "Asia/Kolkata", timeZone: "Asia/Kolkata", policyId: "world_no_banner", banner: false, analytics: "granted", ads: "granted" },
  { name: "Europe/Kyiv", timeZone: "Europe/Kyiv", policyId: "world_no_banner", banner: false, analytics: "granted", ads: "granted" },
  { name: "America/Toronto", timeZone: "America/Toronto", policyId: "quebec_opt_in", banner: true, analytics: "denied", ads: "denied" },
  { name: "America/Vancouver", timeZone: "America/Vancouver", policyId: "canada_opt_in", banner: true, analytics: "denied", ads: "denied" },
  { name: "America/Los_Angeles", timeZone: "America/Los_Angeles", policyId: "california_opt_out", banner: false, analytics: "granted", ads: "granted" },
  { name: "America/New_York", timeZone: "America/New_York", policyId: "world_no_banner", banner: false, analytics: "granted", ads: "granted" },
  { name: "Asia/Tokyo", timeZone: "Asia/Tokyo", policyId: "world_no_banner", banner: false, analytics: "granted", ads: "granted" },
  { name: "Etc/UTC", timeZone: "Etc/UTC", policyId: "europe_opt_in", banner: true, analytics: "denied", ads: "denied" },
  { name: "missing time zone", timeZone: null, policyId: "europe_opt_in", banner: true, analytics: "denied", ads: "denied" },
  { name: "cookie JP-13 over Europe/Berlin", cookie: "pd_geo=JP-13", timeZone: "Europe/Berlin", policyId: "world_no_banner", banner: false, analytics: "granted", ads: "granted" },
  { name: "cookie XX- over Asia/Tokyo", cookie: "pd_geo=XX-", timeZone: "Asia/Tokyo", policyId: "world_no_banner", banner: false, analytics: "granted", ads: "granted" },
  { name: "cookie US-NY over Europe/Berlin", cookie: "pd_geo=US-NY", timeZone: "Europe/Berlin", policyId: "world_no_banner", banner: false, analytics: "granted", ads: "granted" },
];

const originalResolvedOptions = Intl.DateTimeFormat.prototype.resolvedOptions;

const clearCookies = () => {
  for (const entry of document.cookie.split(";")) {
    const name = entry.split("=")[0]?.trim();
    if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  }
};

const stubTimeZone = (timeZone: string | null) => {
  vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockImplementation(function (
    this: Intl.DateTimeFormat
  ) {
    if (timeZone === null) throw new RangeError("time zone unavailable");
    return { ...originalResolvedOptions.call(this), timeZone };
  });
};

const dataLayer = (): DataLayerEntry[] =>
  (window as unknown as { dataLayer?: DataLayerEntry[] }).dataLayer ?? [];

const consentCommands = (): unknown[][] =>
  dataLayer()
    .map((entry) => Array.from(entry))
    .filter((entry) => entry[0] === "consent");

const lastConsentParams = (): Record<string, string> | undefined =>
  consentCommands().at(-1)?.[2] as Record<string, string> | undefined;

const firstDefaultParams = (): Record<string, string> | undefined =>
  consentCommands().find((entry) => entry[1] === "default")?.[2] as
    | Record<string, string>
    | undefined;

const loadProvider = async () => {
  vi.resetModules();
  const { ThemeProvider: FreshThemeProvider } = await import("../../contexts/ThemeContext");
  const module = await import("../ConsentProvider");
  const FreshConsentProvider = module.default;
  return ({ children }: { children: ReactNode }) => (
    <FreshThemeProvider>
      <FreshConsentProvider>{children}</FreshConsentProvider>
    </FreshThemeProvider>
  );
};

describe("ConsentProvider region policy", () => {
  beforeEach(() => {
    clearConsentRuntimeCache();
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
    delete (window as unknown as { dataLayer?: unknown; gtag?: unknown }).dataLayer;
    delete (window as unknown as { dataLayer?: unknown; gtag?: unknown }).gtag;
    document.querySelectorAll("script").forEach((script) => script.remove());
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    clearCookies();
    localStorage.clear();
    clearConsentRuntimeCache();
    document.documentElement.removeAttribute("data-consent-pending");
  });

  it.each(rows)("applies the policy for $name", async (row) => {
    if (row.cookie) document.cookie = row.cookie;
    stubTimeZone(row.timeZone);
    const RegionProvider = await loadProvider();

    let store: ConsentStore | undefined;
    const Probe = () => {
      store = useConsentManager();
      return null;
    };

    render(
      <RegionProvider>
        <Probe />
      </RegionProvider>
    );

    await waitFor(() => {
      expect(store?.lastBannerFetchData).toBeTruthy();
    });

    expect(store?.lastBannerFetchData?.policyDecision?.policyId).toBe(row.policyId);
    expect(store?.activeUI === "banner").toBe(row.banner);

    await waitFor(() => {
      expect(firstDefaultParams()?.analytics_storage).toBe(row.analytics);
    });
    expect(firstDefaultParams()?.ad_storage).toBe(row.ads);

    await waitFor(() => {
      expect(lastConsentParams()?.analytics_storage).toBe(row.analytics);
    });
    expect(lastConsentParams()?.ad_storage).toBe(row.ads);
  });

  it.each(rows)("settles the pending attribute for $name", async (row) => {
    if (row.cookie) document.cookie = row.cookie;
    stubTimeZone(row.timeZone);
    document.documentElement.setAttribute("data-consent-pending", "");
    const RegionProvider = await loadProvider();

    let store: ConsentStore | undefined;
    const Probe = () => {
      store = useConsentManager();
      return null;
    };

    render(
      <RegionProvider>
        <Probe />
      </RegionProvider>
    );

    await waitFor(() => {
      expect(store?.lastBannerFetchData).toBeTruthy();
    });

    if (row.banner) {
      expect(document.documentElement.hasAttribute("data-consent-pending")).toBe(true);
    } else {
      await waitFor(() => {
        expect(document.documentElement.hasAttribute("data-consent-pending")).toBe(false);
      });
    }
  });

  it("drops the pending attribute once a choice is made", async () => {
    stubTimeZone("Europe/Berlin");
    document.documentElement.setAttribute("data-consent-pending", "");
    const RegionProvider = await loadProvider();

    let store: ConsentStore | undefined;
    const Probe = () => {
      store = useConsentManager();
      return null;
    };

    render(
      <RegionProvider>
        <Probe />
      </RegionProvider>
    );

    await waitFor(() => {
      expect(store?.activeUI).toBe("banner");
    });
    expect(document.documentElement.hasAttribute("data-consent-pending")).toBe(true);

    await act(async () => {
      await store?.saveConsents("necessary");
    });

    await waitFor(() => {
      expect(document.documentElement.hasAttribute("data-consent-pending")).toBe(false);
    });
  });
});

const APP_FONT_FAMILY =
  '"Manrope Variable", "Manrope", "Manrope Fallback", system-ui, -apple-system, "Segoe UI", sans-serif';

const mediaListeners: Array<(event: MediaQueryListEvent) => void> = [];

const slotStyle = (value: unknown): ClassNameStyle =>
  value as ClassNameStyle;

const themeStyleElement = (): string =>
  document.getElementById("c15t-theme")?.innerHTML ?? "";

beforeEach(() => {
  window.localStorage.clear();
  mediaListeners.length = 0;
  document.documentElement.className = "";
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.dataset.appVisible = "true";
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({
      matches: false,
      addEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) => {
        mediaListeners.push(listener);
      },
      removeEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) => {
        const index = mediaListeners.indexOf(listener);
        if (index >= 0) mediaListeners.splice(index, 1);
      },
    })),
  });
});

describe("consentTheme", () => {
  it("builds the palette and colour scheme from the selected theme", () => {
    const dark = consentTheme("dark");
    const light = consentTheme("light");

    expect(dark.colorScheme).toBe("dark");
    expect(light.colorScheme).toBe("light");

    expect(dark.theme?.colors?.surface).toBe(themeTokens.dark.bg);
    expect(light.theme?.colors?.surface).toBe(themeTokens.light.bg);
    expect(dark.theme?.colors?.text).toBe(themeTokens.dark.text);
    expect(light.theme?.colors?.text).toBe(themeTokens.light.text);
    expect(dark.theme?.colors?.overlay).toBe(themeTokens.dark.overlay);
    expect(light.theme?.colors?.overlay).toBe(themeTokens.light.overlay);

    // c15t resolves the active palette from `colors` plus `dark`; both keys
    // carry the same tokens so the banner matches whichever scheme is active.
    expect(dark.theme?.dark).toEqual(dark.theme?.colors);
    expect(light.theme?.dark).toEqual(light.theme?.colors);
  });

  it("keeps the dark output equivalent to the previous dark theme", () => {
    const { theme } = consentTheme("dark");

    expect(theme?.colors?.primary).toBe(themeTokens.dark.a);
    expect(theme?.colors?.primaryHover).toBe(themeTokens.dark.b);
    expect(theme?.colors?.surfaceHover).toBe(themeTokens.dark["consent-surface-hover"]);
    expect(theme?.colors?.border).toBe(themeTokens.dark["line-strong"]);
    expect(theme?.colors?.borderHover).toBe(themeTokens.dark["white-22"]);
    expect(theme?.colors?.textMuted).toBe(themeTokens.dark["white-66"]);
    expect(theme?.colors?.textOnPrimary).toBe(themeTokens.dark["on-accent"]);

    expect(theme?.typography?.fontFamily).toBe(APP_FONT_FAMILY);
    expect(theme?.typography?.fontSize).toEqual({
      sm: "1.4rem",
      base: "1.6rem",
      lg: "2.2rem",
    });
    expect(theme?.spacing).toEqual({
      xs: "0.6rem",
      sm: "1rem",
      md: "1.6rem",
      lg: "2.4rem",
      xl: "3.2rem",
    });
    expect(theme?.radius).toEqual({
      sm: "0.8rem",
      md: "1.2rem",
      lg: "1.6rem",
      full: "9999px",
    });
    expect(theme?.consentActions).toEqual({
      accept: { variant: "primary", mode: "filled" },
      reject: { variant: "neutral", mode: "ghost" },
      customize: { variant: "neutral", mode: "ghost" },
    });

    const card = slotStyle(theme?.slots?.consentBannerCard);
    expect(card.style?.background).toBe(themeTokens.dark["consent-card"]);
    expect(card.style?.border).toBe(
      `1px solid ${themeTokens.dark["consent-card-border"]}`
    );
    expect(card.style?.boxShadow).toBe(
      `0 0.8rem 4rem ${themeTokens.dark["consent-shadow"]}`
    );

    const footer = slotStyle(theme?.slots?.consentBannerFooter);
    expect(footer.style?.background).toBe("transparent");
    expect(footer.style?.gap).toBe("1rem");
  });
});

describe("ConsentProvider", () => {
  it("switches the c15t colour scheme and theme variables with the app theme", async () => {
    window.localStorage.setItem("theme", "dark");

    const Probe = () => {
      const { theme, toggle } = useTheme();
      return (
        <button type="button" aria-label="Current theme" onClick={toggle}>
          {theme}
        </button>
      );
    };

    render(
      <ThemeProvider>
        <ConsentProvider>
          <Probe />
        </ConsentProvider>
      </ThemeProvider>
    );

    expect(screen.getByRole("button", { name: "Current theme" })).toHaveTextContent("dark");
    await waitFor(() => expect(screen.getByTestId("consent-banner-card")).toBeInTheDocument());
    expect(screen.getByTestId("consent-banner-title")).toHaveTextContent("We value your privacy");
    expect(document.querySelector("#consent-dialog-root")).not.toBeInTheDocument();
    expect(document.documentElement.classList.contains("c15t-dark")).toBe(true);
    expect(themeStyleElement()).toContain(`--c15t-surface: ${themeTokens.dark.bg}`);

    await act(async () => {
      screen.getByRole("button", { name: "Current theme" }).click();
    });

    expect(screen.getByRole("button", { name: "Current theme" })).toHaveTextContent("light");
    await waitFor(() => expect(screen.getByTestId("consent-banner-card")).toBeInTheDocument());
    expect(screen.getByTestId("consent-banner-title")).toHaveTextContent("We value your privacy");
    expect(document.documentElement.classList.contains("c15t-dark")).toBe(false);
    expect(themeStyleElement()).toContain(`--c15t-surface: ${themeTokens.light.bg}`);
    expect(themeStyleElement()).not.toContain(`--c15t-surface: ${themeTokens.dark.bg}`);
  });
});
