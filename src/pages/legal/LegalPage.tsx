import styled from "styled-components";
import { useMarkContentReady } from "../../ads/ContentReadyContext";
import { ReactNode } from "react";

const StyledLegalPage = styled.div`
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: var(--bg);
`;

const Content = styled.article`
  width: 100%;
  max-width: 90rem;
  padding: 2rem 2.4rem 6rem;
  display: flex;
  flex-direction: column;
  gap: 1.6rem;
  color: var(--main);

  h1 {
    font-size: 4rem;
    font-weight: 600;
    margin-bottom: 0.4rem;

    @media (max-width: 900px) {
      font-size: 3rem;
    }
  }

  h2 {
    font-size: 2.6rem;
    font-weight: 500;
    margin-top: 2rem;

    @media (max-width: 900px) {
      font-size: 2.1rem;
    }
  }

  p,
  li {
    font-size: 1.7rem;
    line-height: 1.7;
    color: var(--white-85);
  }

  ul {
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
    padding-left: 2.4rem;
  }

  a {
    color: var(--link);
    text-decoration: underline;
  }

  .updated {
    font-size: 1.4rem;
    color: var(--white-50);
  }
`;

interface Props {
  children: ReactNode;
}

// Shared layout for static informational pages (Privacy, About). Mirrors the
// landing page chrome: header on top, readable content column, footer below.
const LegalPage = ({ children }: Props) => {
  useMarkContentReady(true);

  return (
    <StyledLegalPage>
      <Content>{children}</Content>
    </StyledLegalPage>
  );
};

export default LegalPage;
