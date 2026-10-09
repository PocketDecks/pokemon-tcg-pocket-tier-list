// Central configuration for the ads layer.
//
// The implementation is network-agnostic at the placement level: every position
// renders through `AdSlot`, which reads these flags. The active network is
// Google AdSense; swapping networks later only touches `adsense.ts`, `AdSlot`,
// and this file, not the placement call sites.

// Master switch for the whole ads layer, dev placeholders included. Real ads
// additionally require the visitor's marketing consent, gated in useAdsState.
export const ADS_ENABLED = true;

// In local development we render labelled placeholder boxes instead of loading
// the real ad network, so the layout/spacing can be verified without third
// party scripts or console noise.
export const IS_DEV = import.meta.env.DEV;

// AdSense publisher ID. Public by design — it already ships verbatim in
// index.html's verification snippet and in every served page.
export const ADSENSE_CLIENT = "ca-pub-3547629432918335";

// Full URL of the AdSense loader, also used by the ad-block probe.
export const ADSENSE_SCRIPT_URL = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`;

// AdSense ad unit slot IDs, one per on-screen position. Create these as
// "Display" ad units in the AdSense dashboard (https://adsense.google.com)
// once approved, then paste the numeric slot IDs here. Filling these plus
// ADSENSE_CLIENT + the ADS_ENABLED flag is all that's needed to go live.
export const ADSENSE_SLOTS = {
  anchor: "6391402118",
  landing: "2452157107",
  tierList: "9572403149",
  deck: "8781910120",
  statistics: "",
} as const;

export type AdPlacement = keyof typeof ADSENSE_SLOTS;

// Reserved heights (px) so slots don't cause layout shift before they fill.
// The anchor hosts a short horizontal banner; in-content units are larger.
export const ANCHOR_HEIGHT_MOBILE = 60;
export const ANCHOR_HEIGHT_DESKTOP = 90;
export const ANCHOR_STRIP_HEIGHT = 18;
export const ANCHOR_BORDER = 1;
export const ANCHOR_MOBILE_MAX_WIDTH = 900;
export const ANCHOR_RESERVE_MOBILE = ANCHOR_HEIGHT_MOBILE + ANCHOR_STRIP_HEIGHT + ANCHOR_BORDER;
export const ANCHOR_RESERVE_DESKTOP = ANCHOR_HEIGHT_DESKTOP + ANCHOR_BORDER;
