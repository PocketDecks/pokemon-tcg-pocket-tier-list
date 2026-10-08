import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import useAdBlocked from "../useAdBlocked";
import { ADSENSE_SCRIPT_URL } from "../adsConfig";

const settle = () =>
  act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

const hangUntilAborted = (_url: string, init?: RequestInit) =>
  new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () =>
      reject(new DOMException("The operation was aborted.", "AbortError"))
    );
  });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue({ type: "opaque" });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useAdBlocked", () => {
  it("does nothing while disabled", async () => {
    const createElement = vi.spyOn(document, "createElement");
    const { result } = renderHook(() => useAdBlocked(false));
    await settle();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(createElement).not.toHaveBeenCalledWith("script");
    expect(result.current).toBe(false);
  });

  it("probes the AdSense URL with a no-cors HEAD request", async () => {
    renderHook(() => useAdBlocked(true));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        ADSENSE_SCRIPT_URL,
        expect.objectContaining({ method: "HEAD", mode: "no-cors", cache: "no-store" })
      )
    );
  });

  it("never injects a script element", async () => {
    const createElement = vi.spyOn(document, "createElement");
    renderHook(() => useAdBlocked(true));
    await settle();

    expect(createElement).not.toHaveBeenCalledWith("script");
    expect(document.querySelector('script[src*="adsbygoogle.js"]')).toBeNull();
  });

  it("reports blocked when the request is rejected", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const { result } = renderHook(() => useAdBlocked(true));

    await waitFor(() => expect(result.current).toBe(true));
  });

  it("reports not blocked when the request resolves", async () => {
    const { result } = renderHook(() => useAdBlocked(true));
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current).toBe(false);
  });

  it("reports blocked when the request times out after 2500 ms", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(hangUntilAborted);
    const { result } = renderHook(() => useAdBlocked(true));

    await act(() => vi.advanceTimersByTimeAsync(2499));
    expect(result.current).toBe(false);

    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(result.current).toBe(true);
  });
});
