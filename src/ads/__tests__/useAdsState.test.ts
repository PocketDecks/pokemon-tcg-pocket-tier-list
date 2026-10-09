import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import useAdsState from "../useAdsState";

const consent: { has: (name: string) => boolean; policyCategories: string[] | null } = {
  has: () => false,
  policyCategories: null,
};

vi.mock("@c15t/react", () => ({
  useConsentManager: () => consent,
}));

vi.mock("../../app/use-is-premium", () => ({
  default: () => false,
}));

const environment = { appVisible: true, prerender: false };

vi.mock("../../app/use-app-visible", () => ({
  useAppVisible: () => environment.appVisible,
}));

vi.mock("../../app/prerender", () => ({
  get isPrerender() {
    return environment.prerender;
  },
}));

const readiness = { ready: true };

vi.mock("../ContentReadyContext", () => ({
  useContentReady: () => readiness.ready,
}));

vi.mock("../adsConfig", () => ({
  ADS_ENABLED: true,
  IS_DEV: false,
}));

beforeEach(() => {
  consent.has = () => false;
  consent.policyCategories = null;
  readiness.ready = true;
  environment.appVisible = true;
  environment.prerender = false;
});

describe("useAdsState marketing consent", () => {
  it("shows real ads where the active policy does not scope marketing", () => {
    consent.policyCategories = ["necessary", "measurement"];

    const { result } = renderHook(() => useAdsState());

    expect(result.current).toEqual({ resolved: true, showAds: true, useReal: true, reserved: true });
  });

  it("keeps ads hidden without marketing consent where the policy scopes marketing", () => {
    consent.policyCategories = ["necessary", "marketing"];

    const { result } = renderHook(() => useAdsState());

    expect(result.current).toEqual({ resolved: true, showAds: false, useReal: false, reserved: false });
  });

  it("keeps ads hidden without marketing consent where the policy has no category scope", () => {
    const { result } = renderHook(() => useAdsState());

    expect(result.current).toEqual({ resolved: true, showAds: false, useReal: false, reserved: false });
  });

  it("reserves the anchor space before the content is ready, without showing ads", () => {
    consent.policyCategories = ["necessary", "measurement"];
    readiness.ready = false;

    const { result } = renderHook(() => useAdsState());

    expect(result.current).toEqual({ resolved: true, showAds: false, useReal: false, reserved: true });
  });

  it("shows real ads once marketing consent is given where the policy has no category scope", () => {
    consent.has = (name) => name === "marketing";

    const { result } = renderHook(() => useAdsState());

    expect(result.current).toEqual({ resolved: true, showAds: true, useReal: true, reserved: true });
  });

  it("reserves nothing until the app swap makes it visible", () => {
    consent.policyCategories = ["necessary", "measurement"];
    environment.appVisible = false;

    const { result } = renderHook(() => useAdsState());

    expect(result.current).toEqual({ resolved: true, showAds: false, useReal: false, reserved: false });
  });

  it("shows and reserves nothing while the build prerenders the page", () => {
    consent.policyCategories = ["necessary", "measurement"];
    environment.prerender = true;

    const { result } = renderHook(() => useAdsState());

    expect(result.current).toEqual({ resolved: true, showAds: false, useReal: false, reserved: false });
  });
});

describe("useAdsState Global Privacy Control", () => {
  const setGpc = (value: boolean) =>
    Object.defineProperty(window.navigator, "globalPrivacyControl", {
      configurable: true,
      value,
    });

  afterEach(() => {
    delete (window.navigator as { globalPrivacyControl?: boolean }).globalPrivacyControl;
  });

  it("keeps ads hidden with GPC where the policy does not scope marketing", () => {
    setGpc(true);
    consent.policyCategories = ["necessary", "measurement"];

    const { result } = renderHook(() => useAdsState());

    expect(result.current).toEqual({ resolved: true, showAds: false, useReal: false, reserved: false });
  });

  it("keeps ads hidden with GPC even when marketing consent was given", () => {
    setGpc(true);
    consent.policyCategories = ["necessary", "marketing"];
    consent.has = (name) => name === "marketing";

    const { result } = renderHook(() => useAdsState());

    expect(result.current).toEqual({ resolved: true, showAds: false, useReal: false, reserved: false });
  });
});
