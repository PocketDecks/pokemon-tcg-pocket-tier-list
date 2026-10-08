import styled from "styled-components";
import { useTranslation } from "react-i18next";
import { useTheme } from "../contexts/ThemeContext";
import NavIcon from "./NavIcon";

const ToggleButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 4.4rem;
  height: 4.4rem;
  border-radius: 1rem;
  color: var(--main);
  cursor: pointer;
  background: var(--fill-hover);
  transition: background 150ms ease-out;

  &:hover {
    background: var(--fill-active);
  }

  &:active {
    transform: translateY(1px);
  }
`;

const Glyph = styled.span`
  display: grid;
  place-items: center;
  width: 2.4rem;
  height: 2.4rem;
`;

const IconSlot = styled.span<{ $active: boolean }>`
  grid-area: 1 / 1;
  display: grid;
  place-items: center;
  opacity: ${(props) => (props.$active ? 1 : 0)};
  transform: rotate(${(props) => (props.$active ? "0deg" : "-90deg")});
  transition: opacity 200ms cubic-bezier(0.16, 1, 0.3, 1),
    transform 200ms cubic-bezier(0.16, 1, 0.3, 1);
`;

const ThemeToggle = () => {
  const { theme, toggle } = useTheme();
  const { t } = useTranslation();
  const isDark = theme === "dark";
  const label = isDark ? t("a11y.switchToLight") : t("a11y.switchToDark");

  return (
    <ToggleButton
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
    >
      <Glyph>
        <IconSlot $active={isDark}>
          <NavIcon name="sun" size={22} />
        </IconSlot>
        <IconSlot $active={!isDark}>
          <NavIcon name="moon" size={22} />
        </IconSlot>
      </Glyph>
    </ToggleButton>
  );
};

export default ThemeToggle;
