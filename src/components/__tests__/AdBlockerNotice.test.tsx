import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));

vi.mock("../../ads/useAdsState", () => ({
  default: vi.fn(),
}));

let AdBlockerNotice: typeof import("../AdBlockerNotice").default;
let useAdsStateMock: typeof import("../../ads/useAdsState").default;
let fetchMock: ReturnType<typeof vi.fn>;

const settle = () =>
  act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

const hangUntilAborted = (_url: string, init?: RequestInit) =>
  new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () =>
      reject(new DOMException("The operation was aborted.", "AbortError"))
    );
  });

const withRealAds = (useReal: boolean) =>
  vi.mocked(useAdsStateMock).mockReturnValue({
    resolved: true,
    showAds: useReal,
    useReal,
    reserved: useReal,
  });

beforeEach(async () => {
  vi.resetModules();
  ({ default: AdBlockerNotice } = await import("../AdBlockerNotice"));
  ({ default: useAdsStateMock } = await import("../../ads/useAdsState"));
  fetchMock = vi.fn().mockResolvedValue({ type: "opaque" });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("AdBlockerNotice", () => {
  it("neither probes nor shows the notice without marketing consent", async () => {
    withRealAds(false);
    const createElement = vi.spyOn(document, "createElement");
    render(<AdBlockerNotice />);
    await settle();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(createElement).not.toHaveBeenCalledWith("script");
    expect(document.querySelector('script[src*="adsbygoogle.js"]')).toBeNull();
    expect(screen.queryByText(/Does your ad blocker/)).not.toBeInTheDocument();
  });

  it("shows the notice when the probe is rejected", async () => {
    withRealAds(true);
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<AdBlockerNotice />);

    expect(await screen.findByText(/Does your ad blocker/)).toBeInTheDocument();
  });

  it("hides the notice when the probe resolves", async () => {
    withRealAds(true);
    render(<AdBlockerNotice />);
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Does your ad blocker/)).not.toBeInTheDocument();
  });

  it("hides the notice when the probe times out", async () => {
    vi.useFakeTimers();
    withRealAds(true);
    fetchMock.mockImplementation(hangUntilAborted);
    render(<AdBlockerNotice />);

    await act(() => vi.advanceTimersByTimeAsync(2500));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Does your ad blocker/)).not.toBeInTheDocument();
  });
});
