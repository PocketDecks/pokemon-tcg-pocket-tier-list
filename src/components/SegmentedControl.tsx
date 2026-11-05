import styled from "styled-components";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import VisuallyHidden from "./VisuallyHidden";

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

  @media (pointer: coarse) {
    min-height: 4.4rem;
  }

  @media (hover: hover) {
    &:hover {
      background: ${(props) =>
        props.$active ? "var(--main)" : props.$locked ? "transparent" : "var(--line)"};
    }
  }
`;

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  locked?: boolean;
}

interface Props<T extends string> {
  label: string;
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}

const SegmentedControl = <T extends string>({ label, options, value, onChange, disabled = false }: Props<T>) => {
  const { t } = useTranslation();
  return (
    <Container role="group" aria-label={label}>
      {options.map((option) => {
        const active = value === option.value;
        const locked = option.locked ?? false;
        return (
          <ToggleButton
            key={option.value}
            type="button"
            $active={active}
            $locked={locked || disabled}
            disabled={disabled}
            aria-pressed={active}
            aria-disabled={locked || undefined}
            onClick={() => {
              if (locked) return;
              onChange(option.value);
            }}
          >
            {option.label}
            {locked && (
              <>
                {" "}
                <VisuallyHidden>{t("a11y.premiumOnly")}</VisuallyHidden>
              </>
            )}
          </ToggleButton>
        );
      })}
    </Container>
  );
};

export default SegmentedControl;
