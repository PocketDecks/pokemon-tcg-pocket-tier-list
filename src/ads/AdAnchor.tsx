import { useEffect, useState } from "react";
import styled from "styled-components";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router";
import AdSlot from "./AdSlot";
import useAdsState from "./useAdsState";
import Premium from "../components/Premium";
import { ANCHOR_HEIGHT_DESKTOP, ANCHOR_HEIGHT_MOBILE } from "./adsConfig";

const STRIP_HEIGHT = 18;

const Anchor = styled.div`
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 900;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  background: var(--bg);
  border-top: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.35);
`;

const Strip = styled.div`
  width: 100%;
  max-width: 150rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.2rem 1rem;
  height: ${STRIP_HEIGHT}px;
`;

const Label = styled.span`
  font-size: 1rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.45);
`;

const Actions = styled.div`
  display: flex;
  align-items: center;
  gap: 1.2rem;
`;

const CloseButton = styled.button`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.8rem;
  height: 1.8rem;
  border-radius: 50%;
  font-size: 1.4rem;
  line-height: 1;
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  transition: background-color 0.2s ease;

  &::after {
    content: "";
    position: absolute;
    inset: -1.3rem -0.6rem;
  }

  &:hover {
    background: rgba(255, 255, 255, 0.1);
  }
`;

const AdRow = styled.div`
  width: 100%;
  max-width: 150rem;
  display: flex;
  justify-content: center;
`;

const AnchorAd = styled(AdSlot)`
  min-height: ${ANCHOR_HEIGHT_MOBILE}px;

  @media (min-width: 901px) {
    min-height: ${ANCHOR_HEIGHT_DESKTOP}px;
  }
`;

const isMobileViewport = (): boolean =>
  typeof window !== "undefined" &&
  window.matchMedia("(max-width: 900px)").matches;

// Persistent, low-intrusion sticky banner shown on every page for free users.
// High viewability (~90%) makes this the primary ad unit. It reserves bottom
// space via the --ad-anchor-h CSS variable so page content is never covered,
// and offers a one-tap path to remove ads via Premium.
//
// Dismissing it (✕) only hides it for the current page. Because this is an SPA,
// we detect navigation via the router's pathname and reset the dismissal on
// every route change so the anchor reappears on the next page.
const AdAnchor = () => {
  const { t } = useTranslation();
  const { showAds } = useAdsState();
  const { pathname } = useLocation();
  const [closed, setClosed] = useState(false);

  // Reappear whenever the user navigates to a different route.
  useEffect(() => {
    setClosed(false);
  }, [pathname]);

  const visible = showAds && !closed;

  useEffect(() => {
    const root = document.documentElement;
    if (!visible) {
      root.style.setProperty("--ad-anchor-h", "0px");
      return;
    }

    const applyHeight = () => {
      const adHeight = isMobileViewport()
        ? ANCHOR_HEIGHT_MOBILE
        : ANCHOR_HEIGHT_DESKTOP;
      root.style.setProperty("--ad-anchor-h", `${adHeight + STRIP_HEIGHT}px`);
    };

    applyHeight();
    window.addEventListener("resize", applyHeight);
    return () => {
      window.removeEventListener("resize", applyHeight);
      root.style.setProperty("--ad-anchor-h", "0px");
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <Anchor>
      <Strip>
        <Label>{t("ads.advertisement")}</Label>
        <Actions>
          <Premium variant="link" linkLabel={t("ads.removeAds")} />
          <CloseButton
            onClick={() => setClosed(true)}
            aria-label={t("ads.close")}
          >
            ×
          </CloseButton>
        </Actions>
      </Strip>
      <AdRow>
        <AnchorAd
          placement="anchor"
          format="horizontal"
          minHeight={ANCHOR_HEIGHT_MOBILE}
        />
      </AdRow>
    </Anchor>
  );
};

export default AdAnchor;
