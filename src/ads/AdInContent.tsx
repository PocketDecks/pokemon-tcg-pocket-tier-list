import styled from "styled-components";
import AdSlot from "./AdSlot";
import useAdsState from "./useAdsState";
import useIsMobile from "./useIsMobile";
import { ADSENSE_SLOTS, AdPlacement, IS_DEV } from "./adsConfig";

const Wrapper = styled.div`
  width: 100%;
  display: flex;
  justify-content: center;
  padding: 2.4rem;

  @media (max-width: 900px) {
    padding: 1.6rem;
  }
`;

const Inner = styled.div`
  width: 100%;
  max-width: 97rem;
`;

interface Props {
  placement: AdPlacement;
  minHeight?: number;
  // Only render on mobile. Used on full-height tool pages (e.g. the tier list)
  // where injecting an in-content unit on desktop would compress the layout.
  mobileOnly?: boolean;
}

// In-content ad placed in the natural reading flow of a page. Studies show
// in-content units in the reading path out-perform sidebar units while keeping
// density low. Renders nothing (no empty spacing) when ads are not shown.
const AdInContent = ({ placement, minHeight = 250, mobileOnly = false }: Props) => {
  const { showAds } = useAdsState();
  const isMobile = useIsMobile();
  if (!showAds) return null;
  if (!IS_DEV && !ADSENSE_SLOTS[placement]) return null;
  if (mobileOnly && !isMobile) return null;

  return (
    <Wrapper>
      <Inner>
        <AdSlot placement={placement} minHeight={minHeight} />
      </Inner>
    </Wrapper>
  );
};

export default AdInContent;
