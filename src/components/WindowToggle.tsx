import styled from "styled-components";
import { useTranslation } from "react-i18next";
import {
  META_WINDOWS,
  META_WINDOW_LABEL_KEYS,
  isPremiumMetaWindow,
} from "../app/meta-window";
import useIsPremium from "../app/use-is-premium";
import { useMetaWindow } from "../app/use-meta-window";
import NavIcon from "./NavIcon";

const Container = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.8rem;
  background: var(--bg);
  padding: 0.4rem;
  border-radius: 0.8rem;
`;

const ToggleButton = styled.button<{ $active: boolean; $locked?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.8rem 1.6rem;
  border-radius: 0.4rem;
  font-size: 1.4rem;
  font-weight: 500;
  background: ${(props) => (props.$active ? "var(--main)" : "transparent")};
  color: ${(props) => (props.$active ? "var(--bg)" : "var(--main)")};
  opacity: ${(props) => (props.$locked ? 0.5 : 1)};
  cursor: ${(props) => (props.$locked ? "not-allowed" : "pointer")};
  border: none;
  transition: background-color 160ms ease-out, color 160ms ease-out;

  &:hover {
    background: ${(props) =>
      props.$active ? "var(--main)" : props.$locked ? "transparent" : "var(--line)"};
  }

  @media (max-width: 900px) {
    min-height: 4.4rem;
  }
`;

/** The meta window picker. 10d and 20d are free; 30d and All Time need Premium. */
const WindowToggle = () => {
  const { t } = useTranslation();
  const isPremium = useIsPremium();
  const { window, setWindow } = useMetaWindow();

  return (
    <Container role="group" aria-label={t("window.label")}>
      {META_WINDOWS.map((option) => {
        const locked = isPremiumMetaWindow(option) && !isPremium;
        return (
          <ToggleButton
            key={option}
            type="button"
            $active={window === option}
            $locked={locked}
            aria-pressed={window === option}
            aria-disabled={locked || undefined}
            onClick={() => {
              if (locked) return;
              setWindow(option);
            }}
          >
            {t(META_WINDOW_LABEL_KEYS[option])}
            {locked && <NavIcon name="lock" size={14} />}
          </ToggleButton>
        );
      })}
    </Container>
  );
};

export default WindowToggle;
