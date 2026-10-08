import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { useConsentManager } from "@c15t/react";
import { clearConsentRuntimeCache } from "c15t";
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
  const module = await import("../ConsentProvider");
  return module.default as (props: { children: ReactNode }) => ReactNode;
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
  });

  it.each(rows)("applies the policy for $name", async (row) => {
    if (row.cookie) document.cookie = row.cookie;
    stubTimeZone(row.timeZone);
    const ConsentProvider = await loadProvider();

    let store: ConsentStore | undefined;
    const Probe = () => {
      store = useConsentManager();
      return null;
    };

    render(
      <ConsentProvider>
        <Probe />
      </ConsentProvider>
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
});
