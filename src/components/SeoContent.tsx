import { ReactNode } from "react";
import styled from "styled-components";

// A readable text section used to give tool pages substantive, original
// publisher content (for AdSense policy compliance and SEO). Written in English
// and placed below the interactive content so it doesn't disrupt the tools.
const Section = styled.section`
  width: 100%;
  max-width: 90rem;
  margin: 0 auto;
  padding: 4rem 2.4rem 7rem;
  display: flex;
  flex-direction: column;
  gap: 1.4rem;
  color: var(--main);

  h2 {
    font-size: 3rem;
    font-weight: 600;

    @media (max-width: 900px) {
      font-size: 2.4rem;
    }
  }

  h3 {
    font-size: 2rem;
    font-weight: 500;
    margin-top: 1.6rem;

    @media (max-width: 900px) {
      font-size: 1.8rem;
    }
  }

  p,
  li {
    font-size: 1.6rem;
    line-height: 1.7;
    color: var(--white-82);
  }

  ul {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    padding-left: 2.4rem;
  }

  a {
    color: var(--f);
    text-decoration: underline;
  }
`;

interface Props {
  children: ReactNode;
}

const SeoContent = ({ children }: Props) => {
  return <Section>{children}</Section>;
};

export default SeoContent;
