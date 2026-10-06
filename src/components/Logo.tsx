import styled from "styled-components";

import logo from "../assets/logo.webp";
import { Link } from "react-router";

const Container = styled(Link)`
  display: flex;
  align-items: center;
  border-radius: 1rem;
  transition: transform 200ms cubic-bezier(0.16, 1, 0.3, 1);

  &:hover {
    transform: rotate(-6deg);
  }
`;

const StyledLogo = styled.img`
  width: 5.2rem;

  @media (max-width: 900px) {
    width: 4.8rem;
  }
`;

const Logo = () => {
  return (
    <Container to="/">
      <StyledLogo src={logo} alt="Top Pocket Decks" />
    </Container>
  );
};

export default Logo;
