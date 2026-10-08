import { describe, expect, it } from "vitest";
import { OfflineClient, deleteCookie, policyPackPresets, setCookie } from "c15t";
import {
  buildConsentPendingData,
  consentPendingScript,
  type ConsentPendingData,
} from "../consent-pending";
import {
  CONSENT_PENDING_ATTRIBUTE,
  CONSENT_STORAGE_KEY,
} from "../consent-pending-keys";
import { policyPacks } from "../policy-packs";
import { timeZoneCountries } from "../time-zone-countries";
import { resolveVisitorRegion } from "../visitor-region";
import { rows } from "./region-matrix";

interface Visitor {
  cookie?: string;
  timeZone: string | null;
  storage?: string | null;
}

const bannerFor = async ({ cookie = "", timeZone }: Visitor): Promise<boolean> => {
  const region = resolveVisitorRegion({ cookie, timeZone });
  const headers: Record<string, string> = {};
  if (region?.country) headers["x-c15t-country"] = region.country;
  if (region?.region) headers["x-c15t-region"] = region.region;
  const response = await new OfflineClient(undefined, undefined, undefined, {
    policyPacks,
  }).init({ headers });
  const policy = response.data?.policy;
  const mode = policy?.ui?.mode;
  return mode === undefined ? policy?.model !== "none" : mode !== "none";
};

const runScript = (script: string, { cookie = "", timeZone, storage = null }: Visitor): boolean => {
  const attributes = new Map<string, string>();
  const documentStub = {
    cookie,
    documentElement: {
      setAttribute: (name: string, value: string) => attributes.set(name, value),
    },
  };
  const localStorageStub = {
    getItem: (key: string) => (key === CONSENT_STORAGE_KEY ? storage : null),
  };
  const intlStub = {
    DateTimeFormat: () => ({
      resolvedOptions: () => {
        if (timeZone === null) throw new RangeError("time zone unavailable");
        return { timeZone };
      },
    }),
  };
  new Function("document", "localStorage", "Intl", script)(documentStub, localStorageStub, intlStub);
  return attributes.has(CONSENT_PENDING_ATTRIBUTE);
};

const stored = JSON.stringify({ consents: {}, consentInfo: { time: 1, subjectId: "sub_1" } });

const encodeConsentCookie = (value: unknown): string => {
  setCookie(CONSENT_STORAGE_KEY, value);
  const cookie = document.cookie;
  deleteCookie(CONSENT_STORAGE_KEY);
  return cookie;
};

describe("consent pending head script", () => {
  let data: ConsentPendingData;
  let script: string;

  const prepare = async () => {
    data ??= await buildConsentPendingData();
    script ??= consentPendingScript(data);
  };

  it("matches the provider policy for every time zone in the region table", async () => {
    await prepare();
    const zones = [
      ...Object.keys(timeZoneCountries),
      "Etc/UTC",
      "UTC",
      "GMT",
      "Etc/GMT+5",
      "Mars/Olympus_Mons",
      "constructor",
      "",
    ];

    const mismatches: string[] = [];
    for (const timeZone of zones) {
      const expected = await bannerFor({ timeZone });
      if (runScript(script, { timeZone }) !== expected) mismatches.push(timeZone);
    }

    expect(mismatches).toEqual([]);
    expect(zones.some((zone) => timeZoneCountries[zone] !== undefined)).toBe(true);
  }, 120000);

  it("treats an unavailable time zone like an unmapped one", async () => {
    await prepare();

    expect(runScript(script, { timeZone: null })).toBe(await bannerFor({ timeZone: null }));
    expect(runScript(script, { timeZone: null })).toBe(true);
  });

  it.each([
    "pd_geo=DE-BE",
    "pd_geo=GB-",
    "pd_geo=FR-IDF",
    "pd_geo=CH-",
    "pd_geo=CA-QC",
    "pd_geo=CA-ON",
    "pd_geo=CA-",
    "pd_geo=US-CA",
    "pd_geo=US-NY",
    "pd_geo=US-",
    "pd_geo=JP-13",
    "pd_geo=NG-",
    "pd_geo=XX-",
    "pd_geo=T1-",
    "pd_geo=de-be",
    "pd_geo=DEU-BE",
    "pd_geo=DE",
    "pd_geo=DE-BE-1",
    "pd_geo=DE-TOOLONG",
    "theme=dark; pd_geo=JP-13",
    "pd_geo=JP-13; theme=dark",
    "xpd_geo=DE-BE",
  ])("matches the provider policy for the cookie %s", async (cookie) => {
    await prepare();

    for (const timeZone of ["Europe/Berlin", "Asia/Tokyo", "America/New_York", "Etc/UTC", null]) {
      expect(runScript(script, { cookie, timeZone })).toBe(await bannerFor({ cookie, timeZone }));
    }
  });

  it("raises the flag for opt-in zones and not for open ones", async () => {
    await prepare();

    expect(runScript(script, { timeZone: "Europe/Berlin" })).toBe(true);
    expect(runScript(script, { timeZone: "Etc/UTC" })).toBe(true);
    expect(runScript(script, { timeZone: "America/Toronto" })).toBe(true);
    expect(runScript(script, { timeZone: "America/New_York" })).toBe(false);
    expect(runScript(script, { timeZone: "America/Los_Angeles" })).toBe(false);
    expect(runScript(script, { timeZone: "Asia/Tokyo" })).toBe(false);
  });

  it("stays quiet once a consent choice is stored in local storage", async () => {
    await prepare();

    expect(runScript(script, { timeZone: "Europe/Berlin", storage: stored })).toBe(false);
    expect(runScript(script, { timeZone: "Europe/Berlin", storage: "{}" })).toBe(true);
    expect(runScript(script, { timeZone: "Europe/Berlin", storage: "not json" })).toBe(true);
  });

  it("shows the banner again when the stored choice requires re-consent", async () => {
    await prepare();
    const reconsent = JSON.stringify({
      consents: {},
      consentInfo: { time: 1, subjectId: "sub_1", requiresReconsent: true },
    });

    expect(runScript(script, { timeZone: "Europe/Berlin", storage: reconsent })).toBe(true);
  });

  it("stays quiet once the consent cookie is stored", async () => {
    await prepare();

    expect(
      runScript(script, { timeZone: "Europe/Berlin", cookie: "c15t=i.t:1,i.sid:sub_1" })
    ).toBe(false);
    expect(
      runScript(script, { timeZone: "Europe/Berlin", cookie: "theme=dark; c15t=i.t:1" })
    ).toBe(false);
    expect(runScript(script, { timeZone: "Europe/Berlin", cookie: "xc15t=1" })).toBe(true);
  });

  it("shows the banner again when the consent cookie requires re-consent", async () => {
    await prepare();
    const cookie = encodeConsentCookie({
      consents: { necessary: true },
      consentInfo: { time: 1, subjectId: "sub_1", requiresReconsent: true },
    });

    expect(cookie).toContain("requiresReconsent:1");
    expect(runScript(script, { timeZone: "Europe/Berlin", cookie })).toBe(true);
    expect(
      runScript(script, { timeZone: "Europe/Berlin", cookie: `theme=dark; ${cookie}` })
    ).toBe(true);
  });

  it("stays quiet once a consent cookie without re-consent is stored", async () => {
    await prepare();
    const cookie = encodeConsentCookie({
      consents: { necessary: true },
      consentInfo: { time: 1, subjectId: "sub_1" },
    });

    expect(cookie).not.toContain("requiresReconsent");
    expect(runScript(script, { timeZone: "Europe/Berlin", cookie })).toBe(false);
  });

  it.each(rows)("agrees with the provider banner for $name", async (row) => {
    await prepare();

    expect(runScript(script, { cookie: row.cookie, timeZone: row.timeZone })).toBe(row.banner);
  });

  it("keeps a country whose policy shows no banner off the banner", async () => {
    const policies = [
      { ...policyPackPresets.worldNoBanner(), id: "japan_no_banner", match: { countries: ["JP"] } },
      { ...policyPackPresets.europeOptIn(), id: "rest_opt_in", match: { isDefault: true, fallback: true } },
    ];
    const custom = await buildConsentPendingData(policies, {});
    const customScript = consentPendingScript(custom);

    expect(custom.unmatched).toBe(1);
    expect(custom.countries.JP).toBe(0);
    expect(runScript(customScript, { cookie: "pd_geo=JP-", timeZone: "Europe/Berlin" })).toBe(false);
    expect(runScript(customScript, { cookie: "pd_geo=DE-", timeZone: "Europe/Berlin" })).toBe(true);
  });

  it("keeps the injected data small", async () => {
    await prepare();

    expect(script.length).toBeLessThan(8000);
  });
});
