import styled, { keyframes } from "styled-components";
import tierList from "../../assets/tier-list.webp";
import Button from "../../components/Button";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

const rainbowAnimation = keyframes`
  0% { background-position: 0 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0 50%; }
`;

const StyledHero = styled.div`
  width: 100%;
  min-height: 80dvh;
  display: flex;
  flex-direction: column;
  padding: 2rem 4rem;

  @media (max-width: 900px) {
    padding: 2rem;
    min-height: 0;
  }
`;

const Content = styled.div`
  width: 100%;
  margin: auto;
  display: flex;
  align-items: center;
  flex: 1;
  gap: 4rem;

  @media (max-width: 1024px) {
    flex-direction: column;
    text-align: center;
    gap: 8rem;
  }
`;

const TextSection = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: 4rem;

  @media (max-width: 1024px) {
    align-items: center;
    gap: 2rem;
  }
`;

const StyledHeader = styled.h1`
  font-size: 5.5rem;
  font-weight: 600;

  @media (max-width: 1400px) { font-size: 4.5rem; }
  @media (max-width: 900px) { font-size: 3.6rem; }
`;

const StyledSubheader = styled.h2`
  font-size: 2rem;
  font-weight: 500;
  max-width: 65rem;

  @media (max-width: 1400px) { font-size: 1.8rem; }
  @media (max-width: 900px) { font-size: 1.6rem; }
`;

const ImageSection = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  perspective: 1000px;

  @media (max-width: 1024px) { width: 100%; }
`;

const ImageContainer = styled(Link)`
  padding: 4px;
  border-radius: 16px;
  background: linear-gradient(45deg, var(--s), var(--a), var(--b), var(--c), var(--d), var(--e), var(--s));
  background-size: 300% 300%;
  animation: ${rainbowAnimation} 8s ease infinite;
  transform-style: preserve-3d;
  transition: transform 0.15s ease-out;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4), 0 0 20px rgba(255, 255, 255, 0.1), 0 0 40px rgba(255, 255, 255, 0.05);
  filter: drop-shadow(0 0 15px rgba(255, 255, 255, 0.1));
  cursor: pointer;
  display: block;

  @media (max-width: 1024px) {
    transform: none !important;
    animation: none;
  }
`;

const Image = styled.img`
  width: 65dvh;
  object-fit: cover;
  border-radius: 12px;
  display: block;

  @media (max-width: 1024px) {
    width: 100%;
    max-width: 50rem;
  }
`;

const Hero = () => {
  const { t } = useTranslation();
  const sectionRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const element = sectionRef.current;
    if (!element) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!sectionRef.current) return;
      if (requestRef.current) cancelAnimationFrame(requestRef.current);

      requestRef.current = requestAnimationFrame(() => {
        const rect = element.getBoundingClientRect();

        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        let rotateY = ((e.clientX - centerX) / (rect.width / 2)) * 8;
        let rotateX = -((e.clientY - centerY) / (rect.height / 2)) * 8;

        // Clamp rotation
        rotateY = Math.max(-8, Math.min(8, rotateY));
        rotateX = Math.max(-8, Math.min(8, rotateX));

        // Target the anchor tag directly to bypass any ref-forwarding limits in styled-components
        const tiltElement = element.querySelector('a');
        if (tiltElement && window.innerWidth > 1024) {
          tiltElement.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
        }
      });
    };

    const handleMouseLeave = () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      const tiltElement = element.querySelector('a');
      if (tiltElement) {
        tiltElement.style.transform = 'rotateX(0deg) rotateY(0deg)';
      }
    };

    element.addEventListener("mousemove", handleMouseMove, { passive: true });
    element.addEventListener("mouseleave", handleMouseLeave);


    return () => {
      element.removeEventListener("mousemove", handleMouseMove);
      element.removeEventListener("mouseleave", handleMouseLeave);
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, []);

  return (
      <StyledHero>
        <Content>
          <TextSection>
            <StyledHeader>{t("hero.title")}</StyledHeader>
            <StyledSubheader>{t("hero.subtitle")}</StyledSubheader>
            <div>
              <Button to="/tier-list">{t("hero.button")}</Button>
            </div>
          </TextSection>
          <ImageSection ref={sectionRef}>
            <ImageContainer to="/tier-list">
              <Image src={tierList} alt={t("hero.title")} />
            </ImageContainer>
          </ImageSection>
        </Content>
      </StyledHero>
  );
};

export default Hero;