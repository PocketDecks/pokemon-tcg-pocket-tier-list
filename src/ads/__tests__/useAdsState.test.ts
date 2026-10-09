import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import useAdsState from "../useAdsState";

const consent: { has: (name: string) => boolean } = {
  has: () => false,
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

const grantMarketing = (name: string) => name === "marketing";

beforeEach(() => {
  consent.has = () => false;
  readiness.ready = true;
  environment.appVisible = true;
  environment.prerender = false;
});

describe("useAdsState marketing consent", () => {
  it("keeps ads hidden without marketing consent", () => {
    const { result } = renderHook(() => useAdsState());

    expect(result.current).toEqual({ resolved: true, showAds: false, useReal: false, reserved: false });
  });

  it("shows real ads once marketing consent is given", () => {
    consent.has = grantMarketing;

    const { result } = renderHook(() => useAdsState());

    expect(result.current).toEqual({ resolved: true, showAds: true, useReal: true, reserved: true });
  });

  it("reserves the anchor space before the content is ready, without showing ads", () => {
    consent.has = grantMarketing;
    readiness.ready = false;

    const { result } = renderHook(() => useAdsState());

    expect(result.current).toEqual({ resolved: true, showAds: false, useReal: false, reserved: true });
  });

  it("reserves nothing until the app swap makes it visible", () => {
    consent.has = grantMarketing;
    environment.appVisible = false;

    const { result } = renderHook(() => useAdsState());

    expect(result.current).toEqual({ resolved: true, showAds: false, useReal: false, reserved: false });
  });

  it("shows and reserves nothing while the build prerenders the page", () => {
    consent.has = grantMarketing;
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

  it("keeps ads hidden with GPC when marketing consent was not given", () => {
    setGpc(true);

    const { result } = renderHook(() => useAdsState());

    expect(result.current).toEqual({ resolved: true, showAds: false, useReal: false, reserved: false });
  });

  it("keeps ads hidden with GPC even when marketing consent was given", () => {
    setGpc(true);
    consent.has = grantMarketing;

    const { result } = renderHook(() => useAdsState());

    expect(result.current).toEqual({ resolved: true, showAds: false, useReal: false, reserved: false });
  });
});
