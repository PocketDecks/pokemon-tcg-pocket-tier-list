import styled from "styled-components";

import logo from "../assets/logo.webp";
import { LocaleLink as Link } from "../app/locale-link";

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
  height: auto;

  @media (max-width: 900px) {
    width: 4.8rem;
  }
`;

const Logo = () => {
  return (
    <Container to="/">
      <StyledLogo src={logo} alt="Top Pocket Decks" width={160} height={160} />
    </Container>
  );
};

export default Logo;
