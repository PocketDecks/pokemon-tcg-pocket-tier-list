import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { ADSENSE_SCRIPT_URL } from "../adsConfig";

type UseAdBlocked = (enabled: boolean) => boolean;

const settle = () =>
  act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

const hangUntilAborted = (_url: string, init?: RequestInit) =>
  new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () =>
      reject(new DOMException("The operation was aborted.", "AbortError"))
    );
  });

let fetchMock: ReturnType<typeof vi.fn>;
let useAdBlocked: UseAdBlocked;

beforeEach(async () => {
  vi.resetModules();
  ({ default: useAdBlocked } = await import("../useAdBlocked"));
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
    const { result } = renderHook(() => useAdBlocked(false));
    await settle();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(document.querySelector('script[src*="adsbygoogle.js"]')).toBeNull();
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

  it("never injects the AdSense script", async () => {
    renderHook(() => useAdBlocked(true));
    await settle();

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

  it("reports not blocked when the request times out, even though the abort later rejects it", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(hangUntilAborted);
    const { result } = renderHook(() => useAdBlocked(true));
    const signal: AbortSignal = fetchMock.mock.calls[0][1].signal;

    await act(() => vi.advanceTimersByTimeAsync(2499));
    expect(result.current).toBe(false);
    expect(signal.aborted).toBe(false);

    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(signal.aborted).toBe(true);
    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(result.current).toBe(false);
  });

  it("probes once per page load across remounts", async () => {
    const first = renderHook(() => useAdBlocked(true));
    await settle();
    first.unmount();

    renderHook(() => useAdBlocked(true));
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("probes once per page load when enabled flips back on", async () => {
    const { rerender } = renderHook(({ enabled }) => useAdBlocked(enabled), {
      initialProps: { enabled: true },
    });
    await settle();

    rerender({ enabled: false });
    rerender({ enabled: true });
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
