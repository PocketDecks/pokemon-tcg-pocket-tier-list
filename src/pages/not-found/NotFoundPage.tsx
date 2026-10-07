import styled from "styled-components";
import { Link } from "react-router";
import { useMarkContentReady } from "../../ads/ContentReadyContext";

const Wrapper = styled.div`
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: var(--bg);
`;

const Content = styled.div`
  flex: 1;
  width: 100%;
  max-width: 90rem;
  padding: 4rem 2.4rem 8rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1.6rem;
  text-align: center;
  color: var(--main);
`;

const Code = styled.div`
  font-size: 10rem;
  font-weight: 700;
  line-height: 1;
  color: var(--a);
  letter-spacing: 0.05em;

  @media (max-width: 900px) {
    font-size: 7rem;
  }
`;

const Title = styled.h1`
  font-size: 3.4rem;
  font-weight: 600;

  strong,
  em {
    font-size: inherit;
  }

  @media (max-width: 900px) {
    font-size: 2.6rem;
  }
`;

const Message = styled.p`
  font-size: 1.7rem;
  line-height: 1.7;
  max-width: 52rem;
  color: rgba(255, 255, 255, 0.82);

  strong,
  em,
  a {
    font-size: inherit;
  }
`;

const HomeLink = styled(Link)`
  font-size: 1.6rem;
  font-weight: 600;
  color: var(--main);
  text-decoration: none;
  padding: 1.2rem 3rem;
  border-radius: 1.2rem;
  background: linear-gradient(135deg, var(--s), var(--a), var(--b));
  transition: opacity 0.2s ease;

  &:hover {
    opacity: 0.9;
  }
`;

// Rendered for routes that don't match anything (see the "*" route in App).
// Keeps unknown URLs on the site chrome (header/footer) instead of bouncing
// users to the landing page or a blank screen.
const NotFoundPage = () => {
  useMarkContentReady(true);

  return (
    <Wrapper>
      <Content>
        <Code>404</Code>
        <Title>Page not found</Title>
        <Message>
          Sorry, that page doesn&apos;t exist or has moved.
        </Message>
        <HomeLink to="/tier-list">Back to the tier list</HomeLink>
      </Content>
    </Wrapper>
  );
};

export default NotFoundPage;
