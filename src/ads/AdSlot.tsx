import { useEffect, useRef } from "react";
import styled from "styled-components";
import { useLocation } from "react-router";
import { ADSENSE_CLIENT, ADSENSE_SLOTS, AdPlacement } from "./adsConfig";
import { ensureAdSenseScript, pushAd } from "./adsense";
import useAdsState from "./useAdsState";

const Container = styled.div<{ $minHeight: number }>`
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: ${(props) => props.$minHeight}px;
  /* No overflow:hidden — clipping a served ad violates AdSense policy. */
`;

const Ins = styled.ins`
  display: block;
  width: 100%;
`;

const DevPlaceholder = styled.div<{ $minHeight: number }>`
  width: 100%;
  min-height: ${(props) => props.$minHeight}px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 0.4rem;
  border: 1px dashed var(--white-35);
  border-radius: 0.8rem;
  background: repeating-linear-gradient(
    45deg,
    var(--white-03),
    var(--white-03) 10px,
    var(--fill-hover) 10px,
    var(--fill-hover) 20px
  );
  color: var(--white-55);
  font-size: 1.2rem;
  font-weight: 500;
  letter-spacing: 0.05em;
  text-transform: uppercase;
`;

interface Props {
  placement: AdPlacement;
  // Reserved height to minimise layout shift before the ad fills.
  minHeight?: number;
  // AdSense ad format. "auto" for in-content; "horizontal" for the anchor so it
  // serves a short banner that fits the sticky bar.
  format?: "auto" | "horizontal" | "rectangle";
  className?: string;
}

// A single ad slot. Renders nothing for Premium users / when ads are disabled,
// a labelled placeholder in development, and a Google AdSense unit in
// production. The <ins> is keyed by route so it remounts (and re-requests an
// ad) on SPA navigation, mirroring a real pageview.
const AdSlot = ({
  placement,
  minHeight = 100,
  format = "auto",
  className,
}: Props) => {
  const { showAds, useReal } = useAdsState();
  const { pathname } = useLocation();
  const slot = ADSENSE_SLOTS[placement];
  const insRef = useRef<HTMLModElement | null>(null);

  useEffect(() => {
    if (!useReal || !slot) return;
    ensureAdSenseScript(ADSENSE_CLIENT);
    // The <ins> is freshly remounted per route (via key), so it has no fill
    // status yet. Guard against a double push (e.g. StrictMode) just in case.
    const el = insRef.current;
    if (el && el.getAttribute("data-adsbygoogle-status")) return;
    pushAd();
  }, [useReal, slot, pathname]);

  if (!showAds) return null;

  // No real ad until both a publisher ID and slot ID are configured.
  if (!useReal || !slot || !ADSENSE_CLIENT) {
    return (
      <DevPlaceholder $minHeight={minHeight} className={className}>
        <span>Advertisement</span>
        <span>{placement}</span>
      </DevPlaceholder>
    );
  }

  return (
    <Container $minHeight={minHeight} className={className}>
      <Ins
        key={pathname}
        ref={insRef}
        className="adsbygoogle"
        data-ad-client={ADSENSE_CLIENT}
        data-ad-slot={slot}
        data-ad-format={format}
        data-full-width-responsive="true"
      />
    </Container>
  );
};

export default AdSlot;
