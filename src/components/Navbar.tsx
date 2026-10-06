import styled from "styled-components";
import { NavLink } from "react-router";
import { useTranslation } from "react-i18next";
import { useUI } from "../contexts/UIContext";
import useIsMobile from "../ads/useIsMobile";
import NavIcon, { type NavIconName } from "./NavIcon";

const Nav = styled.nav<{ $open: boolean }>`
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.4rem;
  padding: 0 0.8rem;

  @media (max-width: 900px) {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    z-index: 60;
    gap: 0.2rem;
    background: var(--bg);
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 1.6rem 3.2rem rgba(0, 0, 0, 0.45);
    padding: 0.8rem 1.2rem 1.6rem;
    opacity: ${(props) => (props.$open ? 1 : 0)};
    transform: ${(props) =>
      props.$open ? "translateY(0)" : "translateY(-0.6rem)"};
    visibility: ${(props) => (props.$open ? "visible" : "hidden")};
    pointer-events: ${(props) => (props.$open ? "auto" : "none")};
    transition: opacity 200ms cubic-bezier(0.16, 1, 0.3, 1),
      transform 200ms cubic-bezier(0.16, 1, 0.3, 1), visibility 200ms;
  }
`;

const Chip = styled.span`
  display: grid;
  place-items: center;
  width: 4.8rem;
  height: 3.2rem;
  border-radius: 1rem;
  transition: background-color 160ms ease-out, color 160ms ease-out;

  @media (max-width: 900px) {
    width: 4rem;
  }
`;

const Label = styled.span`
  font-size: 1.15rem;
  font-weight: 500;
  line-height: 1.2;
  letter-spacing: 0.01em;
  text-align: center;
  text-wrap: balance;
  hyphens: auto;

  @media (max-width: 900px) {
    font-size: 1.6rem;
    text-align: left;
  }
`;

const NavItem = styled(NavLink)<{ $tier: string }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 0.8rem 0.2rem;
  border-radius: 1rem;
  color: rgba(255, 255, 255, 0.64);
  transition: color 160ms ease-out;

  &:hover {
    color: var(--main);
  }

  &:hover ${Chip} {
    background: rgba(255, 255, 255, 0.08);
  }

  &.active {
    color: var(--main);
  }

  &.active ${Label} {
    font-weight: 600;
  }

  &.active ${Chip} {
    background: ${(props) => props.$tier};
    color: rgba(0, 0, 0, 0.8);
  }

  @media (max-width: 900px) {
    flex-direction: row;
    gap: 1.2rem;
    min-height: 4.8rem;
    padding: 0.4rem 0.8rem;
  }
`;

const ITEMS: { to: string; key: string; icon: NavIconName; tier: string }[] = [
  { to: "/tier-list", key: "header.tierList", icon: "tierList", tier: "var(--s)" },
  { to: "/deck", key: "header.bestDeckFinder", icon: "deckFinder", tier: "var(--a)" },
  { to: "/cards-list", key: "header.bestCards", icon: "bestCards", tier: "var(--b)" },
  { to: "/expansion-list", key: "header.bestExpansions", icon: "expansions", tier: "var(--c)" },
  { to: "/statistics", key: "header.statistics", icon: "statistics", tier: "var(--d)" },
];

const Navbar = () => {
  const { t } = useTranslation();
  const { isNavOpen, toggleNav } = useUI();
  const isMobile = useIsMobile();
  const open = !isMobile || isNavOpen;

  return (
    <Nav id="site-nav" aria-label={t("a11y.primaryNav")} $open={open}>
      {ITEMS.map((item) => (
        <NavItem
          key={item.to}
          to={item.to}
          end={item.to === "/deck"}
          $tier={item.tier}
          onClick={isMobile ? toggleNav : undefined}
        >
          <Chip>
            <NavIcon name={item.icon} />
          </Chip>
          <Label>{t(item.key)}</Label>
        </NavItem>
      ))}
    </Nav>
  );
};

export default Navbar;
