import styled, { css } from "styled-components";

export const Body = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.6rem;
  width: 100%;
`;

export const Text = styled.p`
  margin: 0;
  font-size: 1.5rem;
  line-height: 1.5;
  color: var(--main);
`;

export const Price = styled(Text)`
  font-size: 1.7rem;
  font-weight: 700;
  line-height: 1.35;
`;

export const Hint = styled(Text)`
  font-size: 1.3rem;
  color: var(--text-muted);
`;

export const PerksLead = styled(Text)`
  font-size: 1.4rem;
  color: var(--text-muted);
  margin-bottom: -0.8rem;
`;

export const Perks = styled.ul`
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  margin: 0;
  padding: 0;
  list-style: none;
`;

export const Perk = styled.li`
  position: relative;
  padding-left: 1.8rem;
  font-size: 1.5rem;
  line-height: 1.4;
  color: var(--main);

  &::before {
    content: "";
    position: absolute;
    left: 0.2rem;
    top: 0.65em;
    width: 0.6rem;
    height: 0.6rem;
    border-radius: 50%;
    background: var(--link);
  }
`;

export const Actions = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const primaryAction = css`
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 4.8rem;
  padding: 1.2rem 2.2rem;
  border-radius: 8px;
  background: var(--link);
  color: var(--bg);
  font: inherit;
  font-size: 1.6rem;
  font-weight: 700;
  text-decoration: none;
  cursor: pointer;

  align-self: flex-start;
  min-width: 20rem;

  &:hover {
    opacity: 0.85;
  }

  &:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 3px;
  }
`;

export const CtaLink = styled.a`
  ${primaryAction}
`;

export const CtaButton = styled.button`
  ${primaryAction}
`;

export const ActionButton = styled.button`
  cursor: pointer;
  min-height: 4.4rem;
  padding: 0.8rem 1.4rem;
  border: 1px solid var(--line-strong);
  border-radius: 8px;
  background: var(--surface);
  color: var(--main);
  font: inherit;
  font-size: 1.4rem;
  font-weight: 600;

  &:hover {
    background: var(--fill-hover);
  }
`;

export const SmallPrint = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.8rem;
  font-size: 1.3rem;
  color: var(--text-muted);
`;

const toggleStyles = css`
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  min-height: 3.2rem;
  padding: 0;
  border: 0;
  background: none;
  color: var(--link);
  font: inherit;
  font-size: 1.3rem;
  text-decoration: underline;
`;

export const AltToggle = styled.button`
  ${toggleStyles}
`;

export const Rules = styled.details`
  summary {
    ${toggleStyles}
  }

  p {
    margin: 0.4rem 0 0;
    font-size: 1.3rem;
    line-height: 1.5;
    color: var(--text-muted);
  }
`;

export const AltSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  align-self: stretch;
  padding: 1.2rem;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface-sunk);
`;

export const InlineLink = styled.a`
  color: var(--link);
  font-size: inherit;
  text-decoration: underline;

  &:hover {
    opacity: 0.8;
  }
`;
