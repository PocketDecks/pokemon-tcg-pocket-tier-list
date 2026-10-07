import styled, { keyframes, css } from "styled-components";
import { Link } from "react-router";
import { ReactNode } from "react";

const rainbowAnimation = keyframes`
  0% {
    transform: translateX(0);
  }
  50% {
    transform: translateX(-33.333%);
  }
  100% {
    transform: translateX(0);
  }
`;

const spinAnimation = keyframes`
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
`;

const Spinner = styled.div`
  width: 2.4rem;
  height: 2.4rem;
  border: 3px solid var(--bg);
  border-top: 3px solid transparent;
  border-radius: 50%;
  animation: ${spinAnimation} 1s linear infinite;
`;

const Icon = styled.img`
  width: 3.2rem;
  height: 3.2rem;
  object-fit: contain;
  margin-right: -0.4rem;
`;

const buttonBase = css<{ $isLoading: boolean; $wide: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.8rem;
  height: 5.4rem;
  padding: 0 3.2rem;
  border-radius: 0.8rem;
  position: relative;
  isolation: isolate;
  overflow: hidden;

  &::before {
    position: absolute;
    inset: 0;
    z-index: -1;
    width: 300%;
    content: "";
    background: linear-gradient(
      45deg,
      var(--s),
      var(--a),
      var(--b),
      var(--c),
      var(--d),
      var(--f),
      var(--s)
    );
    background-size: 33.333% 100%;
    animation: ${rainbowAnimation} 8s ease infinite;
  }

  & > * {
    position: relative;
    z-index: 1;
  }

  color: var(--bg);
  font-size: 2.1rem;
  font-weight: 600;
  cursor: ${(props) => (props.$isLoading ? "not-allowed" : "pointer")};
  transition: transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease;
  border: 2px solid transparent;
  position: relative;
  width: ${(props) => (props.$wide ? "100%" : "auto")};
  text-decoration: none;

  &:hover {
    transform: ${(props) => (props.$isLoading ? "none" : "scale(1.02)")};
    box-shadow: ${(props) =>
        props.$isLoading ? "none" : "0 0 15px rgba(255, 255, 255, 0.3)"};
  }

  &:disabled {
    opacity: 0.7;
  }
`;

const StyledButton = styled.button<{ $isLoading: boolean; $wide: boolean }>`
  ${buttonBase}
`;

const StyledLink = styled(Link)<{ $isLoading: boolean; $wide: boolean }>`
  ${buttonBase}
`;

interface ButtonProps {
  children: ReactNode;
  isLoading?: boolean;
  wide?: boolean;
  icon?: string;
}

interface ActionButtonProps extends ButtonProps {
  action: () => void;
  to?: never;
}

interface LinkButtonProps extends ButtonProps {
  to: string;
  action?: never;
}

interface PlainButtonProps extends ButtonProps {
  to?: never;
  action?: never;
}

type Props = ActionButtonProps | LinkButtonProps | PlainButtonProps;


const Button = ({
  action,
  to,
  children,
  isLoading = false,
  wide = false,
  icon,
}: Props) => {
  const commonProps = {
    disabled: isLoading,
    $isLoading: isLoading,
    $wide: wide,
  };

  if (to) {
    return (
      <StyledLink to={to} {...commonProps}>
        {!isLoading && (
          <>
            {children}
            {icon && <Icon src={icon} alt="" />}
          </>
        )}
        {isLoading && <Spinner />}
      </StyledLink>
    );
  }

  return (
    <StyledButton onClick={action} {...commonProps}>
      {!isLoading && (
        <>
          {children}
          {icon && <Icon src={icon} alt="" />}
        </>
      )}
      {isLoading && <Spinner />}
    </StyledButton>
  );
};

export default Button;
