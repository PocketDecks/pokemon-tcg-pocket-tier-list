import { useEffect, useState } from "react";
import { ADSENSE_SCRIPT_URL } from "./adsConfig";

const probeAdScript = (timeoutMs = 2500): Promise<boolean> => {
  const controller = new AbortController();
  let timer = 0;
  const timeout = new Promise<boolean>((resolve) => {
    timer = window.setTimeout(() => resolve(false), timeoutMs);
  });
  const request = fetch(ADSENSE_SCRIPT_URL, {
    method: "HEAD",
    mode: "no-cors",
    cache: "no-store",
    signal: controller.signal,
  }).then(
    () => false,
    () => true
  );

  return Promise.race([request, timeout]).finally(() => {
    window.clearTimeout(timer);
    controller.abort();
  });
};

let pageProbe: Promise<boolean> | undefined;

// Stays false until the probe resolves so the UI never flashes a false positive.
const useAdBlocked = (enabled: boolean): boolean => {
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    if (!pageProbe) pageProbe = probeAdScript();
    let cancelled = false;
    pageProbe.then((isBlocked) => {
      if (!cancelled) setBlocked(isBlocked);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return enabled && blocked;
};

export default useAdBlocked;
