import { useConsentManager } from "@c15t/react";
import { isPrerender } from "../app/prerender";
import useIsPremium from "../app/use-is-premium";
import { ADS_ENABLED, IS_DEV } from "./adsConfig";
import { useAppVisible } from "../app/use-app-visible";
import { useContentReady } from "./ContentReadyContext";

export interface AdsState {
  // Premium status has resolved (avoids rendering then yanking ads).
  resolved: boolean;
  // Whether any ad UI (real or dev placeholder) should render.
  showAds: boolean;
  // Whether to load real AdSense ads vs a dev placeholder.
  useReal: boolean;
  reserved: boolean;
}

// Single source of truth for ad gating. Nothing renders unless ADS_ENABLED is
// on; beyond that, ads are hidden for Premium users (ad-free is a Premium
// benefit) and never rendered until premium status is known. Real ads also
// require marketing consent, unless the active policy does not ask for it.
// Development shows placeholders in place of real AdSense units.
const useAdsState = (): AdsState => {
  const isPremium = useIsPremium();
  const contentReady = useContentReady();
  const appVisible = useAppVisible();
  const { has, policyCategories } = useConsentManager();
  const resolved = isPremium !== null;
  const isFree = resolved && !isPremium;

  // In production a slot renders only after marketing consent, unless the active
  // policy does not ask for it. Development still shows the placeholder without
  // a consent choice, so the layout can be checked.
  const gpc = (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
  const marketingOutOfScope =
    policyCategories !== null && !policyCategories.includes("marketing");
  const marketingConsent = !gpc && (marketingOutOfScope || has("marketing"));
  const adsPermitted = IS_DEV ? !gpc : marketingConsent;

  // Only show ads once the current page has rendered real content, so ads never
  // appear on loading, error, or content-less screens (AdSense policy).
  const showAds =
    ADS_ENABLED && !isPrerender && appVisible && isFree && contentReady && adsPermitted;
  const useReal = showAds && !IS_DEV;
  const reserved = ADS_ENABLED && !isPrerender && appVisible && isPremium !== true && adsPermitted;

  return { resolved, showAds, useReal, reserved };
};

export default useAdsState;
