// Thin wrapper around the Google AdSense (adsbygoogle) script.
//
// AdSense's loader only scans the DOM for ad slots once. In a client-routed
// SPA, each <ins class="adsbygoogle"> element must be pushed individually when
// it mounts. `AdSlot` handles remounting per route; this module owns loading
// the script once and exposing a safe push.

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

let injected = false;

// Injects the AdSense loader on demand. AdSlot calls this the first time a slot
// renders, which only happens once the visitor has consented to marketing, so
// the script never loads without consent. It is a no-op if the loader is
// already present or no publisher ID is set.
export const ensureAdSenseScript = (client: string): void => {
  if (injected || typeof window === "undefined" || !client) return;
  injected = true;

  // A previous call may already have added it; don't add a duplicate.
  if (document.querySelector('script[src*="adsbygoogle.js"]')) return;

  const script = document.createElement("script");
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`;
  script.async = true;
  script.crossOrigin = "anonymous";
  document.head.appendChild(script);
};

// Requests an ad for the most recently rendered <ins> slot. Wrapped so an ad
// error can never break the app.
export const pushAd = (): void => {
  if (typeof window === "undefined") return;
  try {
    (window.adsbygoogle = window.adsbygoogle || []).push({});
  } catch (err) {
    console.error("AdSense error:", err);
  }
};
