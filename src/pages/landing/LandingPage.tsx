import styled from "styled-components";
import Hero from "./Hero";
import Features from "./Features";
import BestDeckFinder from "./BestDeckFinder";
import AdInContent from "../../ads/AdInContent";
import { useMarkContentReady } from "../../ads/ContentReadyContext";

const StyledLandingPage = styled.div`
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  max-width: 150rem;
  margin: 0 auto;
  background-color: var(--bg);
`;

const LandingPage = () => {
  useMarkContentReady(true);

  return (
    <StyledLandingPage>
      <Hero />
      <Features />
      <AdInContent placement="landing" />
      <BestDeckFinder />
    </StyledLandingPage>
  );
};

export default LandingPage;
