import { useEffect, useState } from "react";
import { ADSENSE_SCRIPT_URL } from "./adsConfig";

const probeAdScript = (timeoutMs = 2500): Promise<boolean> => {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  return fetch(ADSENSE_SCRIPT_URL, {
    method: "HEAD",
    mode: "no-cors",
    cache: "no-store",
    signal: controller.signal,
  })
    .then(
      () => false,
      () => true
    )
    .finally(() => window.clearTimeout(timer));
};

// Stays false until the probe resolves so the UI never flashes a false positive.
const useAdBlocked = (enabled: boolean): boolean => {
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    probeAdScript().then((isBlocked) => {
      if (!cancelled) setBlocked(isBlocked);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return enabled && blocked;
};

export default useAdBlocked;
