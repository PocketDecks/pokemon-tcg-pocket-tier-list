import styled, { css } from "styled-components";
import { NavLink } from "react-router";
import { useTranslation } from "react-i18next";
import { useUI } from "../contexts/UIContext";
import useIsMobile from "../ads/useIsMobile";

const dropdown = css<{ $open: boolean }>`
  @media (max-width: 900px) {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    z-index: 60;
    flex-direction: column;
    align-items: stretch;
    gap: 0.25rem;
    background: var(--bg);
    border-bottom: 1px solid rgba(255, 255, 255, 0.12);
    box-shadow: 0 12px 24px rgba(0, 0, 0, 0.4);
    padding: 1rem 1rem 1.5rem;
    opacity: ${(props) => (props.$open ? 1 : 0)};
    transform: ${(props) =>
      props.$open ? "translateY(0)" : "translateY(-0.5rem)"};
    visibility: ${(props) => (props.$open ? "visible" : "hidden")};
    pointer-events: ${(props) => (props.$open ? "auto" : "none")};
    transition: opacity 200ms ease-out, transform 200ms ease-out,
      visibility 200ms;
  }

  @media (max-width: 900px) and (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const Nav = styled.nav<{ $open: boolean; $inline: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;

  ${(props) =>
    props.$inline
      ? css`
          @media (max-width: 900px) {
            flex-wrap: wrap;
            justify-content: flex-start;
          }
        `
      : dropdown}
`;

const NavItem = styled(NavLink)<{ $inline: boolean }>`
  display: inline-flex;
  align-items: center;
  font-size: 1.4rem;
  font-weight: 500;
  color: var(--main);
  padding: 0.375rem 1rem;
  border-radius: 0.375rem;
  white-space: nowrap;
  opacity: 0.7;
  transition: opacity 0.2s ease, background 0.2s ease;

  &.active {
    opacity: 1;
    background: rgba(255, 255, 255, 0.12);
    box-shadow: inset 0 -2px 0 var(--focus);
  }

  &:hover {
    opacity: 1;
    background: rgba(255, 255, 255, 0.08);
  }

  @media (max-width: 900px) {
    min-height: 4.4rem;
    padding: 0.8rem 1.2rem;

    ${(props) =>
      !props.$inline &&
      css`
        width: 100%;
        font-size: 1.6rem;
        text-align: left;
      `}
  }
`;

interface Props {
  inline?: boolean;
}

const Navbar = ({ inline = false }: Props) => {
  const { t } = useTranslation();
  const { isNavOpen, toggleNav } = useUI();
  const isMobile = useIsMobile();

  const items = [
    { to: "/tier-list", label: t("header.tierList") },
    { to: "/deck", label: t("header.bestDeckFinder") },
    { to: "/cards-list", label: t("header.bestCards") },
    { to: "/expansion-list", label: t("header.bestExpansions") },
    { to: "/statistics", label: t("header.statistics") },
  ];

  // On desktop the nav stays in the header row. On mobile it is the animated
  // dropdown that opens only after the user taps the menu button.
  const open = inline || !isMobile || isNavOpen;
  const closesMenu = isMobile && !inline;

  return (
    <Nav
      id={inline ? undefined : "site-nav"}
      aria-label={inline ? t("a11y.footerNav") : t("a11y.primaryNav")}
      $open={open}
      $inline={inline}
    >
      {items.map((item) => (
        <NavItem
          key={item.to}
          to={item.to}
          end={item.to === "/deck"}
          $inline={inline}
          onClick={closesMenu ? toggleNav : undefined}
        >
          {item.label}
        </NavItem>
      ))}
    </Nav>
  );
};

export default Navbar;
