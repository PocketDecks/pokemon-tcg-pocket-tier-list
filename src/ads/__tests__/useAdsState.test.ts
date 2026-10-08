import { beforeEach, describe, expect, it, vi } from "vitest";
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

vi.mock("../../app/use-app-visible", () => ({
  useAppVisible: () => true,
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
});
