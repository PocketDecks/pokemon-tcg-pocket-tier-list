import { useEffect, useRef } from "react";
import styled from "styled-components";
import { Link, useLocation } from "react-router";
import Logo from "./Logo";
import Socials from "./Socials";
import Navbar from "./Navbar";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "./LanguageSwitcher";
import UserAccount from "./UserAccount";
import { useUI } from "../contexts/UIContext";
import useIsMobile from "../ads/useIsMobile";
import menuIcon from "../assets/menu.svg";
import closeIcon from "../assets/close.svg";

export const RAIL_WIDTH = "9.2rem";

const Rail = styled.header`
  grid-area: rail;
  position: sticky;
  top: 0;
  z-index: 50;
  align-self: start;
  width: ${RAIL_WIDTH};
  height: calc(100dvh - var(--ad-anchor-h, 0px));
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2.4rem;
  padding: 1.6rem 0 2rem;
  background: #121210;
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  overflow-y: auto;
  scrollbar-width: none;

  @media (max-width: 900px) {
    position: relative;
    width: 100%;
    height: auto;
    flex-direction: row;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.8rem 1.2rem;
    margin-bottom: 1rem;
    background: var(--bg);
    border-right: none;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    overflow: visible;
  }
`;

const NavArea = styled.div`
  width: 100%;
  flex: 1;

  @media (max-width: 900px) {
    flex: 0;
    width: auto;
  }
`;

const Actions = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.2rem;

  @media (max-width: 900px) {
    flex-direction: row;
    gap: 1rem;
  }
`;

const MenuButton = styled.button`
  display: none;
  align-items: center;
  justify-content: center;
  width: 4.4rem;
  height: 4.4rem;
  border-radius: 1rem;
  color: var(--main);
  cursor: pointer;
  background: rgba(255, 255, 255, 0.06);
  transition: background 150ms ease-out;

  &:hover {
    background: rgba(255, 255, 255, 0.12);
  }

  @media (max-width: 900px) {
    display: flex;
  }
`;

const MenuIcon = styled.img`
  width: 2.4rem;
  height: 2.4rem;
`;

const FooterBar = styled.footer`
  width: 100%;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  margin-top: 4rem;
  padding: 0 2.4rem;
`;

const FooterBarInner = styled.div`
  width: 100%;
  max-width: 150rem;
  margin: 0 auto;
  padding: 2rem 0 2.8rem;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1.6rem;
`;

const FooterLinks = styled.div`
  display: flex;
  align-items: center;
  gap: 2.4rem;
`;

const FooterLink = styled(Link)`
  font-size: 1.4rem;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.64);
  transition: color 160ms ease-out;

  &:hover {
    color: var(--main);
  }

  @media (max-width: 900px) {
    display: inline-flex;
    align-items: center;
    min-height: 4.4rem;
  }
`;

const FooterTools = styled.div`
  display: flex;
  align-items: center;
  gap: 2rem;

  @media (max-width: 900px) {
    gap: 1.6rem;
  }
`;

interface Props {
  footer?: boolean;
}

const Header = ({ footer }: Props) => {
  const { t } = useTranslation();
  const { isNavOpen, toggleNav } = useUI();
  const isMobile = useIsMobile();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const { pathname } = useLocation();

  useEffect(() => {
    if (footer || !isNavOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      toggleNav();
      menuButtonRef.current?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [footer, isNavOpen, toggleNav]);

  if (footer) {
    return (
      <FooterBar>
        <FooterBarInner>
          <FooterLinks>
            <FooterLink to="/about">{t("footer.about")}</FooterLink>
            <FooterLink to="/privacy">{t("footer.privacy")}</FooterLink>
            <FooterLink to="/feedback" state={{ from: pathname }}>
              {t("footer.feedback")}
            </FooterLink>
          </FooterLinks>
          <FooterTools>
            <LanguageSwitcher />
            <Socials />
          </FooterTools>
        </FooterBarInner>
      </FooterBar>
    );
  }

  return (
    <Rail>
      <Logo />
      <NavArea>
        <Navbar />
      </NavArea>
      <Actions>
        <UserAccount compact={!isMobile} />
        {isMobile && (
          <MenuButton
            ref={menuButtonRef}
            onClick={toggleNav}
            aria-expanded={isNavOpen}
            aria-controls="site-nav"
            aria-label={isNavOpen ? t("a11y.closeMenu") : t("a11y.openMenu")}
          >
            <MenuIcon src={isNavOpen ? closeIcon : menuIcon} alt="" />
          </MenuButton>
        )}
      </Actions>
    </Rail>
  );
};

export default Header;
