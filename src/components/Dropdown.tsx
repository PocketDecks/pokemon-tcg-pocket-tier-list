import { forwardRef, type ReactNode, type SelectHTMLAttributes } from "react";
import styled from "styled-components";
import NavIcon from "./NavIcon";

const DropdownFrame = styled.div`
  position: relative;
  display: inline-flex;
`;

const StyledSelect = styled.select`
  min-height: 4.4rem;
  width: 100%;
  padding: 0.8rem 4rem 0.8rem 1.2rem;
  font-size: 1.6rem;
  border-radius: 0.4rem;
  background: var(--bg);
  color: var(--main);
  border: 1px solid var(--main);
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;

  &:hover {
    border-color: var(--a);
  }

  &:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }
`;

const Chevron = styled(NavIcon)`
  position: absolute;
  top: 50%;
  right: 1.2rem;
  width: 1.8rem;
  height: 1.8rem;
  color: var(--main);
  pointer-events: none;
  transform: translateY(-50%);
`;

const Dropdown = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { children?: ReactNode }>(
  ({ children, className, ...props }, ref) => (
    <DropdownFrame>
      <StyledSelect ref={ref} className={className} {...props}>
        {children}
      </StyledSelect>
      <Chevron name="chevronDown" size={18} />
    </DropdownFrame>
  )
);

Dropdown.displayName = "Dropdown";

export default Dropdown;
