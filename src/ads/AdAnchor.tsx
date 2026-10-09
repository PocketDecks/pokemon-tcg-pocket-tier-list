import { useEffect, useState } from "react";
import styled from "styled-components";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router";
import AdSlot from "./AdSlot";
import useAdsState from "./useAdsState";
import useAdBlocked from "./useAdBlocked";
import Premium from "../components/Premium";
import {
  ANCHOR_BORDER,
  ANCHOR_HEIGHT_DESKTOP,
  ANCHOR_HEIGHT_MOBILE,
  ANCHOR_MOBILE_MAX_WIDTH,
  ANCHOR_RESERVE_DESKTOP,
  ANCHOR_RESERVE_MOBILE,
  ANCHOR_STRIP_HEIGHT,
} from "./adsConfig";

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
  height: ${ANCHOR_RESERVE_MOBILE}px;
  background: var(--bg);
  border-top: ${ANCHOR_BORDER}px solid var(--line-strong);
  box-shadow: 0 -4px 16px var(--shadow-medium);

  &::after {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    top: 100%;
    height: 1rem;
    background: var(--bg);
  }

  @media (min-width: 901px) {
    display: grid;
    grid-template-columns: minmax(12rem, 1fr) minmax(0, 72.8rem) minmax(12rem, 1fr);
    align-items: center;
    column-gap: 1.6rem;
    height: ${ANCHOR_RESERVE_DESKTOP}px;
    padding: 0 1.6rem;
  }
`;

const Strip = styled.div`
  width: 100%;
  max-width: 150rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.2rem 1rem;
  height: ${ANCHOR_STRIP_HEIGHT}px;

  @media (min-width: 901px) {
    display: contents;
  }
`;

const Label = styled.span`
  font-size: 1rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--white-45);

  @media (min-width: 901px) {
    grid-column: 1;
    grid-row: 1;
    justify-self: start;
  }
`;

const Actions = styled.div`
  display: flex;
  align-items: center;
  gap: 1.2rem;

  @media (min-width: 901px) {
    grid-column: 3;
    grid-row: 1;
    justify-self: end;
  }
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
  color: var(--white-60);
  cursor: pointer;
  transition: background-color 0.2s ease;

  &::after {
    content: "";
    position: absolute;
    inset: -1.3rem -0.6rem;
  }

  &:hover {
    background: var(--white-10);
  }
`;

const AdRow = styled.div`
  width: 100%;
  max-width: 150rem;
  display: flex;
  justify-content: center;

  @media (min-width: 901px) {
    grid-column: 2;
    grid-row: 1;
  }
`;

const AnchorAd = styled(AdSlot)`
  height: ${ANCHOR_HEIGHT_MOBILE}px;

  @media (min-width: 901px) {
    height: ${ANCHOR_HEIGHT_DESKTOP}px;
  }
`;

const isMobileViewport = (): boolean =>
  typeof window !== "undefined" &&
  window.matchMedia(`(max-width: ${ANCHOR_MOBILE_MAX_WIDTH}px)`).matches;

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
  const { showAds, reserved, useReal } = useAdsState();
  const blocked = useAdBlocked(useReal);
  const { pathname } = useLocation();
  const [closed, setClosed] = useState(false);

  // Reappear whenever the user navigates to a different route.
  useEffect(() => {
    setClosed(false);
  }, [pathname]);

  const visible = showAds && !closed && !blocked;
  const reserving = reserved && !closed && !blocked;

  useEffect(() => {
    const root = document.documentElement;
    if (!reserving) {
      root.style.setProperty("--ad-anchor-h", "0px");
      return;
    }

    const applyHeight = () => {
      root.style.setProperty(
        "--ad-anchor-h",
        `${isMobileViewport() ? ANCHOR_RESERVE_MOBILE : ANCHOR_RESERVE_DESKTOP}px`
      );
    };

    applyHeight();
    window.addEventListener("resize", applyHeight);
    return () => {
      window.removeEventListener("resize", applyHeight);
      root.style.setProperty("--ad-anchor-h", "0px");
    };
  }, [reserving]);

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
          fullWidthResponsive={false}
          minHeight={ANCHOR_HEIGHT_MOBILE}
        />
      </AdRow>
    </Anchor>
  );
};

export default AdAnchor;
