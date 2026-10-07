import { useConsentManager } from "@c15t/react";
import useIsPremium from "../app/use-is-premium";
import { ADS_ENABLED, IS_DEV } from "./adsConfig";
import { useAppVisible } from "../app/app-bootstrap";
import { useContentReady } from "./ContentReadyContext";

export interface AdsState {
  // Premium status has resolved (avoids rendering then yanking ads).
  resolved: boolean;
  // Whether any ad UI (real or dev placeholder) should render.
  showAds: boolean;
  // Whether to load real AdSense ads vs a dev placeholder.
  useReal: boolean;
}

// Single source of truth for ad gating. Nothing renders unless ADS_ENABLED is
// on; beyond that, ads are hidden for Premium users (ad-free is a Premium
// benefit) and never rendered until premium status is known. Real ads also
// require the visitor's marketing consent. Development shows placeholders in
// place of real AdSense units.
const useAdsState = (): AdsState => {
  const isPremium = useIsPremium();
  const contentReady = useContentReady();
  const appVisible = useAppVisible();
  const { has } = useConsentManager();
  const resolved = isPremium !== null;
  const isFree = resolved && !isPremium;

  // In production a slot renders only after the visitor consents to marketing,
  // so no ad script or cookie loads beforehand. Development still shows the
  // placeholder without a consent choice, so the layout can be checked.
  const marketingConsent = has("marketing");

  // Only show ads once the current page has rendered real content, so ads never
  // appear on loading, error, or content-less screens (AdSense policy).
  const showAds =
    ADS_ENABLED && appVisible && isFree && contentReady && (IS_DEV || marketingConsent);
  const useReal = showAds && !IS_DEV;

  return { resolved, showAds, useReal };
};

export default useAdsState;
